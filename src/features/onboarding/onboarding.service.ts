import {
  Inject,
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  assertCurrencyMatch,
  isValidCurrencyCode,
} from '@domain/billing/currency.validator';
import { RegisterAndHireDto } from './dto/register-and-hire.dto';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { UserRepository } from '@persistence/repositories/user.repository';
import { AgentRepository } from '@persistence/repositories/agent.repository';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { encryptRecord, encrypt } from '@shared/crypto.util';
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
import { HireChannelLifecyclePublisher } from '@orchestrator/lifecycle/hire-channel-lifecycle.publisher';

export interface RegisterAndHireResult {
  user: {
    _id: string;
    email: string;
    name: string;
    clientId: string;
    status: string;
  };
  client: {
    _id: string;
    type: string;
    name: string;
    ownerUserId: string;
    status: string;
    companyBrief?: string;
  };
  clientAgent: {
    _id: string;
    clientId: string;
    agentId: string;
    agentPricing: { amount: number; currency: string };
    status: string;
    promptSupplement?: string;
  };
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clientRepository: ClientRepository,
    private readonly userRepository: UserRepository,
    private readonly agentRepository: AgentRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly personalityRepository: PersonalityRepository,
    private readonly agentPriceRepository: AgentPriceRepository,
    private readonly channelPriceRepository: ChannelPriceRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
    private readonly lifecyclePublisher: HireChannelLifecyclePublisher,
    @Inject(HIRE_CHANNEL_LIFECYCLE_PORT)
    private readonly lifecycle: HireChannelLifecyclePort,
  ) {}

  async registerAndHire(
    dto: RegisterAndHireDto,
  ): Promise<RegisterAndHireResult> {
    // PRE-TRANSACTION VALIDATIONS (fail fast, no rollback needed)

    // 1. Normalize email
    const normalizedEmail = dto.user.email.toLowerCase().trim();

    // 2. Validate agent is hireable and get agent for quota
    const agent = await this.agentRepository.validateHireable(
      dto.agentHiring.agentId,
    );

    // 3. Validate personality is active
    const personality = await this.personalityRepository.findActiveById(
      dto.agentHiring.personalityId,
    );
    if (!personality) {
      throw new BadRequestException('Personality not found or not active');
    }

    // 4. Validate client name for organization type
    if (dto.client.type === 'organization' && !dto.client.name) {
      throw new BadRequestException(
        'Client name is required for organization type',
      );
    }

    // 5. Channels are validated during processing below

    // TRANSACTION (atomic writes)
    const session = await this.connection.startSession();
    session.startTransaction();

    let client: Awaited<ReturnType<ClientRepository['create']>> | undefined;
    let user: Awaited<ReturnType<UserRepository['create']>> | undefined;
    let clientAgent:
      | Awaited<ReturnType<ClientAgentRepository['create']>>
      | undefined;

    try {
      // 5. Check user email doesn't exist (inside transaction for consistency
      //    under concurrent onboarding — prevents two requests from both passing
      //    this check and producing a less descriptive E11000 error)
      const existingUser = await this.userRepository.findByEmail(
        normalizedEmail,
      );
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }
      // 6. Create Client
      const clientName = dto.client.name || dto.user.name;
      const billingCurrency = (
        dto.client.billingCurrency ?? 'USD'
      ).toUpperCase();
      if (!isValidCurrencyCode(billingCurrency)) {
        throw new BadRequestException('Invalid ISO 4217 currency code');
      }
      const clientPayload: Parameters<ClientRepository['create']>[0] = {
        name: clientName,
        type: dto.client.type,
        status: 'active',
        billingCurrency,
        billingAnchor: new Date(),
      };
      if (dto.client.llmConfig) {
        clientPayload.llmConfig = {
          provider: dto.client.llmConfig.provider,
          apiKey: encrypt(dto.client.llmConfig.apiKey),
          model: dto.client.llmConfig.model,
        };
      }
      const briefTrimmed = dto.client.companyBrief?.trim();
      if (briefTrimmed) {
        clientPayload.companyBrief = briefTrimmed;
      }
      client = await this.clientRepository.create(clientPayload, session);

      // 7. Create User (first user of a fresh client → owner role).
      // Subsequent users created by future team-management endpoints will
      // inherit the schema default `clientRole: 'operator'`.
      user = await this.userRepository.create(
        {
          email: normalizedEmail,
          name: dto.user.name,
          clientId: client._id as Types.ObjectId,
          status: 'active',
          clientRole: 'owner',
        },
        session,
      );

      // 8. Update Client with ownerUserId
      await this.clientRepository.update(
        (client._id as Types.ObjectId).toString(),
        { ownerUserId: user._id as Types.ObjectId },
        session,
      );

      // Resolve agent price for client billing currency
      const agentIdObj = new Types.ObjectId(dto.agentHiring.agentId);
      const agentPrice =
        await this.agentPriceRepository.findActiveByAgentAndCurrency(
          agentIdObj,
          billingCurrency,
        );
      if (!agentPrice && dto.agentHiring.pricingOverride?.agentAmount == null) {
        throw new BadRequestException(
          `No active price found for agent in currency ${billingCurrency}`,
        );
      }
      const agentAmount =
        dto.agentHiring.pricingOverride?.agentAmount ?? agentPrice?.amount ?? 0;
      const agentPricing = {
        amount: agentAmount,
        currency: billingCurrency,
        monthlyTokenQuota:
          dto.agentHiring.pricingOverride?.agentMonthlyTokenQuota ??
          agent.monthlyTokenQuota ??
          null,
      };

      // 10. Process Channels
      const hireChannels = [];
      const processedChannelIds = new Set<string>();

      for (const channelConfig of dto.channels) {
        const platformHosted = Boolean(channelConfig.platformHosted);

        // Validation: Unique channelId in request
        if (processedChannelIds.has(channelConfig.channelId)) {
          throw new BadRequestException(
            `Duplicate channelId in request: ${channelConfig.channelId}`,
          );
        }
        processedChannelIds.add(channelConfig.channelId);

        // Validation: Channel exists (Infrastructure)
        const channel = await this.channelRepository.findByIdOrFail(
          channelConfig.channelId,
        );

        const normalizedProvider = (() => {
          if (platformHosted && !channelConfig.provider) {
            const first = channel.supportedProviders?.[0]
              ?.toLowerCase()
              ?.trim();
            if (!first) {
              throw new BadRequestException(
                `Channel "${channel.name}" has no supported providers; platform-hosted onboarding is unavailable.`,
              );
            }
            return first;
          }
          const fromDto = channelConfig.provider?.toLowerCase()?.trim();
          if (!fromDto) {
            throw new BadRequestException(
              'Provider is required unless platformHosted is true.',
            );
          }
          return fromDto;
        })();

        if (!channel.supportedProviders.includes(normalizedProvider)) {
          throw new BadRequestException(
            `Provider "${normalizedProvider}" is not supported by channel "${
              channel.name
            }". Supported: ${channel.supportedProviders.join(', ')}`,
          );
        }

        const channelIdObj = new Types.ObjectId(channelConfig.channelId);
        const channelPrice =
          await this.channelPriceRepository.findActiveByChannelAndCurrency(
            channelIdObj,
            billingCurrency,
          );
        if (!channelPrice && channelConfig.amountOverride == null) {
          throw new BadRequestException(
            `No active price found for channel in currency ${billingCurrency}`,
          );
        }
        const channelAmount =
          channelConfig.amountOverride ?? channelPrice?.amount ?? 0;
        const channelMonthlyMessageQuota =
          channelConfig.monthlyMessageQuotaOverride ??
          channel.monthlyMessageQuota ??
          null;

        // Routing identifiers: from credentials when present, else from routingIdentifier (meaning depends on channel.type)
        let phoneNumberId: string | undefined;
        let tiktokUserId: string | undefined;
        let instagramAccountId: string | undefined;
        let telegramBotId: string | undefined;
        let telegramWebhookSecretHex: string | undefined;

        if (
          channelConfig.credentials &&
          typeof channelConfig.credentials === 'object'
        ) {
          if ('phoneNumberId' in channelConfig.credentials) {
            phoneNumberId = channelConfig.credentials.phoneNumberId;
          }
          if ('tiktokUserId' in channelConfig.credentials) {
            tiktokUserId = channelConfig.credentials.tiktokUserId;
          }
          if ('instagramAccountId' in channelConfig.credentials) {
            instagramAccountId = channelConfig.credentials.instagramAccountId;
          }
          if ('telegramBotId' in channelConfig.credentials) {
            telegramBotId = String(channelConfig.credentials.telegramBotId);
          }
          if (
            'botToken' in channelConfig.credentials &&
            typeof channelConfig.credentials.botToken === 'string'
          ) {
            const fromToken = parseTelegramBotIdFromToken(
              channelConfig.credentials.botToken,
            );
            if (fromToken) {
              telegramBotId = telegramBotId ?? fromToken;
            }
          }
        }
        if (channelConfig.routingIdentifier?.trim()) {
          const rid = channelConfig.routingIdentifier.trim();
          if (channel.type === 'whatsapp') {
            phoneNumberId = phoneNumberId ?? rid;
          } else if (channel.type === 'instagram') {
            instagramAccountId = instagramAccountId ?? rid;
          } else if (channel.type === 'tiktok') {
            tiktokUserId = tiktokUserId ?? rid;
          } else if (channel.type === 'telegram') {
            telegramBotId = telegramBotId ?? rid;
          }
        }

        if (phoneNumberId) {
          phoneNumberId = normalizeToE164(phoneNumberId);
        }

        const needsRoutingId =
          channel.type === 'whatsapp' ||
          channel.type === 'instagram' ||
          channel.type === 'tiktok' ||
          channel.type === 'telegram';
        const hasRoutingId =
          phoneNumberId || tiktokUserId || instagramAccountId || telegramBotId;
        if (needsRoutingId && !hasRoutingId && !platformHosted) {
          throw new BadRequestException(
            `Channel "${channel.name}" requires either credentials (with the appropriate routing field) or routingIdentifier.`,
          );
        }

        if (phoneNumberId) {
          await this.clientPhoneRepository.resolveOrCreate(
            client._id as Types.ObjectId,
            phoneNumberId,
            {
              provider: normalizedProvider as any,
              session,
            },
          );
        }

        let credentialsToStore: Record<string, unknown> | undefined;
        if (
          channelConfig.credentials &&
          typeof channelConfig.credentials === 'object' &&
          Object.keys(channelConfig.credentials).length > 0
        ) {
          if (channel.type === 'telegram') {
            const bt = channelConfig.credentials.botToken;
            if (typeof bt !== 'string' || !isValidTelegramBotTokenShape(bt)) {
              throw new BadRequestException(
                'Telegram requires botToken in credentials (format: <bot_id>:<secret>)',
              );
            }
            telegramWebhookSecretHex = deriveTelegramWebhookSecret(bt);
            credentialsToStore = encryptRecord({ botToken: bt });
          } else {
            credentialsToStore = encryptRecord({
              ...channelConfig.credentials,
              // Outbound sends read the number back out of credentials, so the
              // stored copy must match the canonical routing form.
              ...(phoneNumberId ? { phoneNumberId } : {}),
            });
          }
        }

        hireChannels.push({
          channelId: channelIdObj,
          provider: normalizedProvider,
          status: 'active',
          credentials: credentialsToStore,
          phoneNumberId,
          tiktokUserId,
          instagramAccountId,
          telegramBotId,
          telegramWebhookSecretHex,
          amount: channelAmount,
          currency: billingCurrency,
          monthlyMessageQuota: channelMonthlyMessageQuota,
        });
      }

      try {
        assertCurrencyMatch(agentPricing.currency, client.billingCurrency);
        for (const ch of hireChannels) {
          assertCurrencyMatch(ch.currency, client.billingCurrency);
        }
      } catch {
        throw new BadRequestException(
          'Pricing currency must match client billing currency',
        );
      }

      const hireSupplementTrimmed = dto.agentHiring.promptSupplement?.trim();

      // 9. Create ClientAgent (pricing snapshot + channels + personality)
      clientAgent = await this.clientAgentRepository.create(
        {
          clientId: (client._id as Types.ObjectId).toString(),
          agentId: dto.agentHiring.agentId,
          personalityId: new Types.ObjectId(dto.agentHiring.personalityId),
          agentPricing,
          billingAnchor: new Date(),
          status: 'active',
          channels: hireChannels,
          ...(hireSupplementTrimmed
            ? { promptSupplement: hireSupplementTrimmed }
            : {}),
        },
        session,
      );

      // 12. Commit transaction
      await session.commitTransaction();
    } catch (error) {
      // Abort transaction on error (may already be aborted by MongoDB on E11000)
      try {
        await session.abortTransaction();
      } catch {
        // Transaction already aborted (e.g. after E11000 duplicate key)
      }

      // Map MongoDB 11000 (duplicate key) to 409 Conflict
      if (this.isDuplicateKeyError(error)) {
        const field = this.extractDuplicateField(error);
        throw new ConflictException(`Duplicate value for field: ${field}`);
      }

      // Re-throw other errors
      throw error;
    } finally {
      // Detach session from any created documents so they can be used after
      // endSession() (avoids MongoExpiredSessionError when docs are later
      // read from the identity map by other requests).
      for (const doc of [client, user, clientAgent]) {
        if (doc && typeof (doc as any).$session === 'function') {
          (doc as any).$session(null);
        }
      }
      session.endSession();
    }

    // Post-commit, pre-enqueue: stamp `pending` on every active telegram
    // channel and trigger the happy-path BullMQ enqueue. Failures are logged
    // and swallowed — the reconciler will heal any miss because the row will
    // either remain `pending` or stay without `webhookRegistration` (both
    // states are picked up by the reconciler scan).
    if (clientAgent && client && user) {
      const clientAgentId = (clientAgent._id as Types.ObjectId).toString();
      try {
        await this.stampPendingAndPublish(clientAgent, clientAgentId);
      } catch (err) {
        this.logger.warn(
          `event=onboarding_post_commit_publish_failed clientAgentId=${clientAgentId} error=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      return {
        user: {
          _id: (user._id as Types.ObjectId).toString(),
          email: user.email,
          name: user.name,
          clientId: (user.clientId as Types.ObjectId).toString(),
          status: user.status,
        },
        client: {
          _id: (client._id as Types.ObjectId).toString(),
          type: client.type,
          name: client.name,
          ownerUserId: (user._id as Types.ObjectId).toString(),
          status: client.status,
          ...(client.companyBrief?.trim()
            ? { companyBrief: client.companyBrief.trim() }
            : {}),
        },
        clientAgent: {
          _id: clientAgentId,
          clientId: clientAgent.clientId,
          agentId: clientAgent.agentId,
          agentPricing: clientAgent.agentPricing,
          status: clientAgent.status,
          ...(clientAgent.promptSupplement?.trim()
            ? { promptSupplement: clientAgent.promptSupplement.trim() }
            : {}),
        },
      };
    }

    // Unreachable in practice — control reaches this point only if the try
    // block both (a) committed and (b) left clientAgent/client/user
    // undefined, which the type system already prevents. Throw to satisfy
    // the return-type contract.
    throw new Error('Onboarding reached an inconsistent state');
  }

  private async stampPendingAndPublish(
    clientAgent: NonNullable<
      Awaited<ReturnType<ClientAgentRepository['create']>>
    >,
    clientAgentId: string,
  ): Promise<void> {
    const telegramBotIds = (clientAgent.channels ?? [])
      .filter(
        (c) =>
          c.provider === 'telegram' &&
          c.status === 'active' &&
          typeof c.telegramBotId === 'string' &&
          c.telegramBotId.length > 0,
      )
      .map((c) => c.telegramBotId as string);

    if (telegramBotIds.length === 0) return;

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
          `event=onboarding_pending_stamp_failed botId=${botId} clientAgentId=${clientAgentId} error=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    await this.lifecyclePublisher.publishHappyPath({
      clientAgentId,
      telegramBotIds,
    });
  }

  private isDuplicateKeyError(error: any): boolean {
    return (
      error?.code === 11000 ||
      (error?.name === 'MongoServerError' && error?.code === 11000)
    );
  }

  private extractDuplicateField(error: any): string {
    const keyPattern = error?.keyPattern;
    if (keyPattern) {
      return Object.keys(keyPattern).join(', ');
    }

    const match = error?.message?.match(/index: (\w+)/);
    return match ? match[1] : 'unknown';
  }
}
