import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailableTwilioNumber,
  ProvisionedTwilioNumber,
  TwilioNumberProvisioningService,
} from '@channels/whatsapp/providers/twilio-provisioning.service';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { ClientAgent } from '@persistence/schemas/client-agent.schema';
import { encrypt } from '@shared/crypto.util';
import { normalizeToE164 } from '@shared/e164.util';
import { SearchNumbersDto } from './dto/search-numbers.dto';
import { ProvisionNumberDto } from './dto/provision-number.dto';
import { AssignNumberDto } from './dto/assign-number.dto';

export interface NumberInventoryEntry extends ProvisionedTwilioNumber {
  assignedClientId?: string;
  /** True when the number still points at this server's webhook. */
  webhookConfigured: boolean;
}

/**
 * Provisioning and assignment of platform-owned Twilio WhatsApp numbers.
 *
 * Orchestrates the transport layer (Twilio REST) and persistence (ownership +
 * hire channel routing). Neither layer may call the other directly.
 */
@Injectable()
export class WhatsappNumbersService {
  private readonly logger = new Logger(WhatsappNumbersService.name);

  constructor(
    private readonly twilioProvisioning: TwilioNumberProvisioningService,
    private readonly clientPhoneRepository: ClientPhoneRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
  ) {}

  async searchAvailable(
    query: SearchNumbersDto,
  ): Promise<AvailableTwilioNumber[]> {
    return this.twilioProvisioning.searchAvailableNumbers({
      countryCode: query.countryCode,
      areaCode: query.areaCode,
      contains: query.contains,
      limit: query.limit,
    });
  }

  /** Twilio inventory annotated with which client owns each number. */
  async listInventory(): Promise<NumberInventoryEntry[]> {
    const owned = await this.twilioProvisioning.listOwnedNumbers();
    const expectedWebhookUrl = this.twilioProvisioning.getInboundWebhookUrl();

    const assignments = await this.clientPhoneRepository.findByPhoneNumbers(
      owned.map((number) => number.phoneNumber),
    );
    const clientByPhoneNumber = new Map(
      assignments.map((assignment) => [
        assignment.phoneNumberId,
        assignment.clientId.toString(),
      ]),
    );

    return owned.map((number) => ({
      ...number,
      assignedClientId: clientByPhoneNumber.get(number.phoneNumber),
      webhookConfigured: number.inboundWebhookUrl === expectedWebhookUrl,
    }));
  }

  /** Buys a number and points it at this server. It stays unassigned. */
  async provision(dto: ProvisionNumberDto): Promise<ProvisionedTwilioNumber> {
    const provisioned = await this.twilioProvisioning.purchaseNumber(
      dto.phoneNumber,
      dto.friendlyName,
    );
    this.logger.log(
      `Provisioned Twilio number ${provisioned.phoneNumber} (sid=${provisioned.sid})`,
    );
    return provisioned;
  }

  /**
   * Attaches a platform-owned number to a client's WhatsApp channel.
   * Ownership is claimed first so a number cannot be routed to two clients.
   */
  async assign(dto: AssignNumberDto): Promise<ClientAgent> {
    const phoneNumber = normalizeToE164(dto.phoneNumber);

    const clientAgent = await this.clientAgentRepository.findById(
      dto.clientAgentId,
    );
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }
    if (clientAgent.status === 'archived') {
      throw new BadRequestException(
        'Cannot assign a number to an archived ClientAgent',
      );
    }

    const channel = clientAgent.channels?.find(
      (candidate) => candidate.channelId.toString() === dto.channelId,
    );
    if (!channel) {
      throw new NotFoundException(
        `Channel ${dto.channelId} is not part of this ClientAgent`,
      );
    }
    if (channel.provider !== ChannelProvider.Twilio) {
      throw new BadRequestException(
        `Channel provider must be "${ChannelProvider.Twilio}" to receive a platform-owned Twilio number`,
      );
    }

    // Throws ConflictException when another client already owns the number.
    await this.clientPhoneRepository.resolveOrCreate(
      clientAgent.clientId,
      phoneNumber,
      { provider: ChannelProvider.Twilio },
    );

    const updated = await this.clientAgentRepository.setChannelPhoneNumber(
      dto.clientAgentId,
      dto.channelId,
      phoneNumber,
      encrypt(phoneNumber),
    );
    if (!updated) {
      throw new NotFoundException('ClientAgent not found after assignment');
    }

    this.logger.log(
      `Assigned ${phoneNumber} to clientAgent=${dto.clientAgentId} channel=${dto.channelId}`,
    );
    return updated;
  }
}
