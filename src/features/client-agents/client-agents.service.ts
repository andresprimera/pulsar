import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import {
  type ClientAgentClientListProjectedField,
  type ClientAgentListProjectedField,
} from '@persistence/repositories/client-agent.repository.constants';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { encryptRecord } from '@shared/crypto.util';
import { normalizeToE164 } from '@shared/e164.util';
import {
  deriveTelegramWebhookSecret,
  isValidTelegramBotTokenShape,
  parseTelegramBotIdFromToken,
} from '@shared/telegram-webhook-secret.util';
import {
  HIRE_CHANNEL_LIFECYCLE_PORT,
  HireChannelLifecyclePort,
} from '@shared/ports/hire-channel-lifecycle.port';

import { assertCurrencyMatch } from '@domain/billing/currency.validator';
import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';
import { ListClientAgentsQueryDto } from './dto/list-client-agents-query.dto';
import {
  ClientAgentSummaryDto,
  PaginatedClientAgentSummary,
} from './dto/client-agent-summary.dto';
import {
  ClientAgentSummaryForClientAgentRef,
  ClientAgentSummaryForClientDto,
} from './dto/client-agent-summary-for-client.dto';
import { ClientsService } from '@clients/clients.service';
import { AgentsService } from '@agents/agents.service';
import {
  ClientAgent,
  HireChannelConfig,
} from '@persistence/schemas/client-agent.schema';
import { HireChannelLifecyclePublisher } from '@orchestrator/lifecycle/hire-channel-lifecycle.publisher';
import { Client } from '@persistence/schemas/client.schema';
import { Agent } from '@persistence/schemas/agent.schema';
import { Personality } from '@persistence/schemas/personality.schema';

@Injectable()
export class ClientAgentsService {
  private readonly logger = new Logger(ClientAgentsService.name);

  constructor(
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientsService: ClientsService,
    private readonly agentsService: AgentsService,
    private readonly channelRepository: ChannelRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
    private readonly agentPriceRepository: AgentPriceRepository,
    private readonly channelPriceRepository: ChannelPriceRepository,
    private readonly personalityRepository: PersonalityRepository,
    private readonly lifecyclePublisher: HireChannelLifecyclePublisher,
    @Inject(HIRE_CHANNEL_LIFECYCLE_PORT)
    private readonly lifecycle: HireChannelLifecyclePort,
  ) {}

  private collectActiveTelegramBotIds(agent: ClientAgent | null): string[] {
    if (!agent) return [];
    return (agent.channels ?? [])
      .filter(
        (c: HireChannelConfig) =>
          c.provider === 'telegram' &&
          c.status === 'active' &&
          typeof c.telegramBotId === 'string' &&
          c.telegramBotId.length > 0,
      )
      .map((c: HireChannelConfig) => c.telegramBotId as string);
  }

  /**
   * Post-commit, pre-enqueue stamping of `pending` on every active telegram
   * channel for this hire, followed by the happy-path BullMQ enqueue. The
   * `pending` write uses a disjunctive `expectStatus` filter so:
   *   - rows with `webhookRegistration` absent (legacy) get stamped to `pending`
   *   - rows already in `pending`/`failed`/`registering` are re-stamped
   *   - rows already in `registered` are NOT clobbered (registrar's
   *     skip-if-fingerprint-matches path stays valid)
   *   - rows already in `quarantined` are NOT clobbered (operator-only reset)
   */
  private async triggerTelegramWebhookRegistration(
    agent: ClientAgent,
  ): Promise<void> {
    if (agent.status !== 'active') return;
    const telegramBotIds = this.collectActiveTelegramBotIds(agent);
    if (telegramBotIds.length === 0) return;

    const clientAgentId = String((agent as any)._id ?? (agent as any).id);

    for (const botId of telegramBotIds) {
      try {
        await this.lifecycle.recordOutcome({
          telegramBotId: botId,
          status: 'pending',
          incrementAttempt: false,
          expectStatus: ['absent', 'pending', 'failed', 'registering'],
        });
      } catch (err) {
        this.logger.warn(
          `event=hire_pending_stamp_failed botId=${botId} clientAgentId=${clientAgentId} error=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    try {
      await this.lifecyclePublisher.publishHappyPath({
        clientAgentId,
        telegramBotIds,
      });
    } catch (err) {
      this.logger.warn(
        `event=hire_lifecycle_happy_path_enqueue_failed clientAgentId=${clientAgentId} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async create(data: CreateClientAgentDto): Promise<ClientAgent> {
    if (!Array.isArray(data.channels) || data.channels.length === 0) {
      throw new BadRequestException('At least one channel is required');
    }

    const client = await this.clientsService.findById(data.clientId);
    if (!client || client.status !== 'active') {
      throw new BadRequestException('Client not found or not active');
    }

    const agent = await this.agentsService.findOne(data.agentId);
    if (!agent || agent.status !== 'active') {
      throw new BadRequestException('Agent not found or not active');
    }

    const personality = await this.personalityRepository.findActiveById(
      data.personalityId,
    );
    if (!personality) {
      throw new BadRequestException('Personality not found or not active');
    }

    const currency = client.billingCurrency;
    const agentIdObj = new Types.ObjectId(data.agentId);

    const agentPrice =
      await this.agentPriceRepository.findActiveByAgentAndCurrency(
        agentIdObj,
        currency,
      );
    if (!agentPrice && data.pricingOverride?.agentAmount == null) {
      throw new BadRequestException(
        `No active price found for agent in currency ${currency}`,
      );
    }
    const agentAmount =
      data.pricingOverride?.agentAmount ?? agentPrice?.amount ?? 0;
    const agentPricing = {
      amount: agentAmount,
      currency,
      monthlyTokenQuota:
        data.pricingOverride?.agentMonthlyTokenQuota ??
        agent.monthlyTokenQuota ??
        null,
    };

    // Fail fast: check if agent is already hired by this client
    const existing = await this.clientAgentRepository.findByClientAndAgent(
      data.clientId,
      data.agentId,
    );
    if (existing && existing.status !== 'archived') {
      throw new ConflictException('Agent already hired by this client');
    }

    const processedChannelIds = new Set<string>();
    const channels = [];

    for (const channelConfig of data.channels) {
      if (processedChannelIds.has(channelConfig.channelId)) {
        throw new BadRequestException(
          `Duplicate channelId in request: ${channelConfig.channelId}`,
        );
      }
      processedChannelIds.add(channelConfig.channelId);

      const channel = await this.channelRepository.findByIdOrFail(
        channelConfig.channelId,
      );

      const normalizedProvider = channelConfig.provider.toLowerCase().trim();
      if (!channel.supportedProviders.includes(normalizedProvider)) {
        throw new BadRequestException(
          `Provider "${channelConfig.provider}" is not supported by channel "${
            channel.name
          }". Supported: ${channel.supportedProviders.join(', ')}`,
        );
      }

      const channelIdObj = new Types.ObjectId(channelConfig.channelId);
      const channelPrice =
        await this.channelPriceRepository.findActiveByChannelAndCurrency(
          channelIdObj,
          currency,
        );
      if (!channelPrice && channelConfig.amountOverride == null) {
        throw new BadRequestException(
          `No active price found for channel in currency ${currency}`,
        );
      }
      const channelAmount =
        channelConfig.amountOverride ?? channelPrice?.amount ?? 0;
      const channelMonthlyMessageQuota =
        channelConfig.monthlyMessageQuotaOverride ??
        channel.monthlyMessageQuota ??
        null;

      let phoneNumberId: string | undefined;
      if (
        channelConfig.credentials &&
        'phoneNumberId' in channelConfig.credentials
      ) {
        phoneNumberId = normalizeToE164(
          channelConfig.credentials.phoneNumberId,
        );
      }

      if (phoneNumberId) {
        await this.clientPhoneRepository.resolveOrCreate(
          data.clientId,
          phoneNumberId,
          {
            provider: normalizedProvider as any,
          },
        );
      }

      let tiktokUserId: string | undefined;
      if (
        channelConfig.credentials &&
        'tiktokUserId' in channelConfig.credentials
      ) {
        tiktokUserId = channelConfig.credentials.tiktokUserId;
      }

      let instagramAccountId: string | undefined;
      if (
        channelConfig.credentials &&
        'instagramAccountId' in channelConfig.credentials
      ) {
        instagramAccountId = channelConfig.credentials.instagramAccountId;
      }

      let telegramBotId: string | undefined;
      let telegramWebhookSecretHex: string | undefined;
      // Outbound sends read the number back out of credentials, so the stored
      // copy must match the canonical routing form.
      let credentialsToStore = {
        ...channelConfig.credentials,
        ...(phoneNumberId ? { phoneNumberId } : {}),
      };
      if (channel.type === 'telegram') {
        const botToken = channelConfig.credentials?.botToken;
        if (
          typeof botToken !== 'string' ||
          !isValidTelegramBotTokenShape(botToken)
        ) {
          throw new BadRequestException(
            'Telegram requires botToken in credentials (format: <bot_id>:<secret>)',
          );
        }
        const parsedId = parseTelegramBotIdFromToken(botToken);
        if (!parsedId) {
          throw new BadRequestException('Invalid Telegram bot token');
        }
        telegramBotId = parsedId;
        telegramWebhookSecretHex = deriveTelegramWebhookSecret(botToken);
        credentialsToStore = { botToken };
      }

      channels.push({
        channelId: channelIdObj,
        provider: normalizedProvider,
        status: 'active',
        credentials: encryptRecord(credentialsToStore),
        phoneNumberId,
        tiktokUserId,
        instagramAccountId,
        telegramBotId,
        telegramWebhookSecretHex,
        amount: channelAmount,
        currency,
        monthlyMessageQuota: channelMonthlyMessageQuota,
      });
    }

    try {
      assertCurrencyMatch(agentPricing.currency, client.billingCurrency);
      for (const ch of channels) {
        assertCurrencyMatch(ch.currency, client.billingCurrency);
      }
    } catch {
      throw new BadRequestException(
        'Pricing currency must match client billing currency',
      );
    }

    const supplementTrimmed = data.promptSupplement?.trim();

    let created: ClientAgent;
    try {
      created = await this.clientAgentRepository.create({
        clientId: data.clientId,
        agentId: data.agentId,
        personalityId: new Types.ObjectId(data.personalityId),
        agentPricing,
        billingAnchor: new Date(),
        status: 'active',
        channels,
        ...(supplementTrimmed ? { promptSupplement: supplementTrimmed } : {}),
      });
    } catch (error: any) {
      // Handle MongoDB duplicate key error (race condition fallback)
      if (error?.code === 11000) {
        throw new ConflictException('Agent already hired by this client');
      }
      throw error;
    }

    await this.triggerTelegramWebhookRegistration(created);
    return created;
  }

  /**
   * Returns hydrated, credential-redacted client-agent summaries for a
   * single client. Reuses the same hydration pipeline as `findAllHydrated`
   * so credentials, telegramWebhookSecretHex, fingerprint, and
   * promptSupplement are stripped at the mapper boundary.
   *
   * @see findByClientForClient — client-tier sibling returning the slim
   *   {@link ClientAgentSummaryForClientDto}[] consumed by the frontend
   *   agent picker.
   */
  async findByClient(clientId: string): Promise<ClientAgentSummaryDto[]> {
    const rows = await this.clientAgentRepository.findByClient(clientId);
    return this.hydrateRows(rows);
  }

  /**
   * Client-tier slim listing for the agent picker (`GET /client-agents/me`).
   * Sibling to the admin-tier {@link findByClient}.
   *
   * Uses the strict allowlist projection
   * `CLIENT_AGENT_CLIENT_LIST_PROJECTION` — `channels`, `personalityId`,
   * `agentPricing`, `billingAnchor`, `toolingProfileId`, `updatedAt` are
   * never read from disk, so they cannot leak even if a future controller
   * change forgets to strip them. Hydration uses a separate
   * `AgentsService.findManyByIds` call (not `.populate()`) to keep the
   * repository free of cross-collection knowledge. Rows whose referenced
   * `Agent` is missing yield `agent: null` (the hire still surfaces so the
   * picker can render an "Agent unavailable" entry if it chooses).
   */
  async findByClientForClient(
    clientId: string,
  ): Promise<ClientAgentSummaryForClientDto[]> {
    const rows =
      await this.clientAgentRepository.findProjectedByClientForClientList(
        clientId,
      );
    if (rows.length === 0) return [];

    const agentIds = Array.from(new Set(rows.map((r) => String(r.agentId))));
    const agents = await this.agentsService.findManyByIds(agentIds);
    const agentById = new Map(agents.map((a) => [String(a._id), a]));

    return rows.map((row) =>
      this.toClientSummary(row, agentById.get(String(row.agentId)) ?? null),
    );
  }

  /**
   * Whitelist field-by-field mapper for the client-tier slim shape.
   * NEVER spread `row` or `agent` — adding fields to the schema must not
   * silently leak onto the wire. Single editing point that pairs with
   * `CLIENT_AGENT_CLIENT_LIST_PROJECTION` (see header comment in
   * `client-agent.repository.constants.ts`).
   */
  private toClientSummary(
    row: Pick<ClientAgent, ClientAgentClientListProjectedField>,
    agent: Agent | null,
  ): ClientAgentSummaryForClientDto {
    const agentRef: ClientAgentSummaryForClientAgentRef | null = agent
      ? {
          id: String(agent._id),
          name: agent.name,
          status: agent.status,
          kind: agent.kind,
        }
      : null;
    return {
      id: String(row._id),
      status: row.status,
      agent: agentRef,
    };
  }

  async findAllHydrated(
    query: ListClientAgentsQueryDto,
  ): Promise<PaginatedClientAgentSummary> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: FilterQuery<ClientAgent> = {};
    if (query.status) filter.status = query.status;
    if (query.clientId) filter.clientId = query.clientId;
    if (query.agentId) filter.agentId = query.agentId;
    if (query.personalityId)
      filter.personalityId = new Types.ObjectId(query.personalityId);
    if (query.createdAfter !== undefined || query.createdBefore !== undefined) {
      const createdAt: Record<string, Date> = {};
      if (query.createdAfter !== undefined) createdAt.$gte = query.createdAfter;
      if (query.createdBefore !== undefined)
        createdAt.$lt = query.createdBefore;
      filter.createdAt = createdAt;
    }

    const sort: Record<string, 1 | -1> = (() => {
      if (!query.sort) return { createdAt: -1 };
      const desc = query.sort.startsWith('-');
      const field = desc ? query.sort.slice(1) : query.sort;
      return { [field]: desc ? -1 : 1 };
    })();

    const [total, pageRows] = await Promise.all([
      this.clientAgentRepository.countByFilter(filter),
      this.clientAgentRepository.findPageWithProjection(filter, {
        skip,
        limit,
        sort,
      }),
    ]);

    const items = await this.hydrateRows(pageRows);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Dedup-fan-out hydration shared by `findAllHydrated` and `findByClient`.
   * Loads the referenced client/agent/personality docs in parallel, then
   * runs every row through `toSummary` so the credential-redaction policy
   * is enforced uniformly.
   */
  private async hydrateRows(
    rows: Pick<ClientAgent, ClientAgentListProjectedField>[],
  ): Promise<ClientAgentSummaryDto[]> {
    if (rows.length === 0) {
      return [];
    }

    const clientIds = Array.from(new Set(rows.map((r) => r.clientId)));
    const agentIds = Array.from(new Set(rows.map((r) => r.agentId)));
    const personalityIds = Array.from(
      new Set(rows.map((r) => String(r.personalityId))),
    );

    const [clients, agents, personalities] = await Promise.all([
      this.clientsService.findManyByIds(clientIds),
      this.agentsService.findManyByIds(agentIds),
      this.personalityRepository.findManyByIds(personalityIds),
    ]);

    const clientById = new Map(clients.map((c) => [String(c._id), c]));
    const agentById = new Map(agents.map((a) => [String(a._id), a]));
    const personalityById = new Map(
      personalities.map((p) => [String(p._id), p]),
    );

    return rows.map((row) =>
      this.toSummary(row, clientById, agentById, personalityById),
    );
  }

  /**
   * Whitelist must remain a subset of CLIENT_AGENT_LIST_PROJECTION
   * (see client-agent.repository.constants.ts).
   *
   * IMPORTANT: never spread the row or channel objects. Whitelist-copy
   * field-by-field so we drop credentials, telegramWebhookSecretHex,
   * webhookRegistration.fingerprint, and promptSupplement even if they
   * appear on the input.
   */
  private toSummary(
    row: Pick<ClientAgent, ClientAgentListProjectedField>,
    clientById: Map<string, Client>,
    agentById: Map<string, Agent>,
    personalityById: Map<string, Personality>,
  ): ClientAgentSummaryDto {
    const client = clientById.get(String(row.clientId)) ?? null;
    const agent = agentById.get(String(row.agentId)) ?? null;
    const personality = personalityById.get(String(row.personalityId)) ?? null;

    return {
      _id: String(row._id),
      clientId: row.clientId,
      agentId: row.agentId,
      personalityId: String(row.personalityId),
      status: row.status,
      agentPricing: row.agentPricing,
      billingAnchor: row.billingAnchor,
      toolingProfileId: row.toolingProfileId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      channels: (row.channels ?? []).map((ch: HireChannelConfig) => ({
        channelId: String(ch.channelId),
        provider: ch.provider,
        status: ch.status,
        amount: ch.amount,
        currency: ch.currency,
        monthlyMessageQuota: ch.monthlyMessageQuota,
        phoneNumberId: ch.phoneNumberId,
        tiktokUserId: ch.tiktokUserId,
        instagramAccountId: ch.instagramAccountId,
        telegramBotId: ch.telegramBotId,
        webhookRegistration: ch.webhookRegistration
          ? {
              status: ch.webhookRegistration.status,
              lastAttemptAt: ch.webhookRegistration.lastAttemptAt,
              registeredAt: ch.webhookRegistration.registeredAt,
              attemptCount: ch.webhookRegistration.attemptCount,
              lastError: ch.webhookRegistration.lastError,
            }
          : undefined,
      })),
      client: client
        ? {
            _id: String(client._id),
            name: client.name,
            status: client.status,
            billingCurrency: client.billingCurrency,
          }
        : null,
      agent: agent
        ? {
            _id: String(agent._id),
            name: agent.name,
            status: agent.status,
            kind: agent.kind,
          }
        : null,
      personality: personality
        ? {
            _id: String(personality._id),
            name: personality.name,
            status: personality.status,
          }
        : null,
    };
  }

  async update(id: string, data: UpdateClientAgentDto): Promise<ClientAgent> {
    const clientAgent = await this.clientAgentRepository.findById(id);
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }

    if (clientAgent.status === 'archived') {
      throw new BadRequestException('Cannot update archived ClientAgent');
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, string> = {};

    if (data.personalityId !== undefined) {
      const personality = await this.personalityRepository.findActiveById(
        data.personalityId,
      );
      if (!personality) {
        throw new BadRequestException('Personality not found or not active');
      }
      $set.personalityId = new Types.ObjectId(data.personalityId);
    }

    if (data.promptSupplement !== undefined) {
      const t = data.promptSupplement.trim();
      if (t) {
        $set.promptSupplement = t;
      } else {
        $unset.promptSupplement = '';
      }
    }

    if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
      return clientAgent;
    }

    const updateQuery: {
      $set?: Record<string, unknown>;
      $unset?: Record<string, string>;
    } = {};
    if (Object.keys($set).length > 0) {
      updateQuery.$set = $set;
    }
    if (Object.keys($unset).length > 0) {
      updateQuery.$unset = $unset;
    }

    const updated = await this.clientAgentRepository.updateWithQuery(
      id,
      updateQuery,
    );
    if (!updated)
      throw new NotFoundException('ClientAgent not found after update');
    return updated;
  }

  async updateStatus(
    id: string,
    data: UpdateClientAgentStatusDto,
  ): Promise<ClientAgent> {
    const clientAgent = await this.clientAgentRepository.findById(id);
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }

    if (clientAgent.status === 'archived') {
      throw new BadRequestException('Cannot modify archived ClientAgent');
    }

    const previousStatus = clientAgent.status;

    const updated = await this.clientAgentRepository.update(id, {
      status: data.status,
    });
    if (!updated)
      throw new NotFoundException('ClientAgent not found after update');

    // Cascade archive happens implicitly because channels are embedded
    if (data.status === 'archived') {
      this.logger.log(
        `[ClientAgent] Archived ClientAgent clientId=${clientAgent.clientId}, agentId=${clientAgent.agentId} (Channels embedded)`,
      );
    }

    if (previousStatus !== 'active' && updated.status === 'active') {
      await this.triggerTelegramWebhookRegistration(updated);
    }

    return updated;
  }

  async calculateClientTotal(
    clientId: string,
  ): Promise<{ total: number; currency: string }> {
    const client = await this.clientsService.findById(clientId);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    const activeClientAgents =
      await this.clientAgentRepository.findByClientAndStatus(
        clientId,
        'active',
      );

    if (activeClientAgents.length === 0) {
      return { total: 0, currency: client.billingCurrency };
    }

    const hasMismatch = activeClientAgents.some(
      (ca) => ca.agentPricing.currency !== client.billingCurrency,
    );
    if (hasMismatch) {
      throw new InternalServerErrorException(
        'Mixed currency subscriptions detected — data integrity violation',
      );
    }

    const total = activeClientAgents.reduce((sum, ca) => {
      const agentAmount = ca.agentPricing.amount;
      const channelsAmount = ca.channels
        .filter((ch) => ch.status === 'active')
        .reduce((chSum, ch) => chSum + ch.amount, 0);
      return sum + agentAmount + channelsAmount;
    }, 0);

    return { total, currency: client.billingCurrency };
  }
}
