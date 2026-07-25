import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailableTwilioNumber,
  ProvisionedTwilioNumber,
  TwilioNumberProvisioningService,
  TwilioWhatsAppSender,
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
  /** Sid of the registered WhatsApp sender, absent until registration. */
  whatsAppSenderSid?: string;
  whatsAppSenderStatus?: string;
  /**
   * True when a registered WhatsApp sender delivers inbound messages to this
   * server. Derived from the sender callback URL, not the number's SMS webhook:
   * a number can be owned and SMS-configured while WhatsApp goes elsewhere.
   */
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

  /**
   * Twilio inventory annotated with which client owns each number and whether
   * its WhatsApp sender delivers inbound messages here.
   */
  async listInventory(): Promise<NumberInventoryEntry[]> {
    const owned = await this.twilioProvisioning.listOwnedNumbers();
    const expectedWebhookUrl = this.twilioProvisioning.getInboundWebhookUrl();
    const senders = await this.twilioProvisioning.listWhatsAppSenders();
    const senderByPhoneNumber = new Map(
      senders.map((sender) => [sender.phoneNumber, sender]),
    );

    const assignments = await this.clientPhoneRepository.findByPhoneNumbers(
      owned.map((number) => number.phoneNumber),
    );
    const clientByPhoneNumber = new Map(
      assignments.map((assignment) => [
        assignment.phoneNumberId,
        assignment.clientId.toString(),
      ]),
    );

    return owned.map((number) => {
      const sender = senderByPhoneNumber.get(number.phoneNumber);
      return {
        ...number,
        assignedClientId: clientByPhoneNumber.get(number.phoneNumber),
        whatsAppSenderSid: sender?.sid,
        whatsAppSenderStatus: sender?.status,
        webhookConfigured: sender?.inboundWebhookUrl === expectedWebhookUrl,
      };
    });
  }

  /**
   * Points a number's registered WhatsApp sender at this server. Needed because
   * buying a number only configures its SMS webhook.
   */
  async configureWebhook(phoneNumber: string): Promise<TwilioWhatsAppSender> {
    const canonical = normalizeToE164(phoneNumber);
    const sender = await this.twilioProvisioning.findWhatsAppSender(canonical);
    if (!sender) {
      throw new NotFoundException(
        `No registered WhatsApp sender found for ${canonical}`,
      );
    }
    return this.twilioProvisioning.configureSenderWebhook(sender.sid);
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

    // Only platform-owned numbers can be routed: anything else would record a
    // routing key that no inbound webhook can ever match.
    const ownedNumber = await this.twilioProvisioning.findOwnedNumber(
      phoneNumber,
    );
    if (!ownedNumber) {
      throw new BadRequestException(
        `${phoneNumber} is not owned by the platform Twilio account`,
      );
    }

    await this.assertNotRoutedElsewhere(phoneNumber, dto);

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
    await this.warnWhenInboundUnreachable(phoneNumber);
    return updated;
  }

  /**
   * Inbound routing resolves a hire from the number alone, so a number routed
   * by two active hires would deliver to whichever matched first.
   */
  private async assertNotRoutedElsewhere(
    phoneNumber: string,
    dto: AssignNumberDto,
  ): Promise<void> {
    const routed = await this.clientAgentRepository.findActiveByPhoneNumberId(
      phoneNumber,
    );

    const conflicting = routed.some((hire) => {
      if (String(hire._id) !== dto.clientAgentId) {
        return true;
      }
      return (hire.channels ?? []).some(
        (candidate) =>
          candidate.phoneNumberId === phoneNumber &&
          candidate.channelId.toString() !== dto.channelId,
      );
    });

    if (conflicting) {
      throw new ConflictException(
        `${phoneNumber} is already routed to an active hire; release it before reassigning`,
      );
    }
  }

  /**
   * Sender registration is an independent Twilio-side lifecycle, so a missing or
   * misdirected sender is reported rather than blocking the assignment.
   */
  private async warnWhenInboundUnreachable(phoneNumber: string): Promise<void> {
    try {
      const expectedWebhookUrl = this.twilioProvisioning.getInboundWebhookUrl();
      const sender = await this.twilioProvisioning.findWhatsAppSender(
        phoneNumber,
      );
      if (!sender) {
        this.logger.warn(
          `${phoneNumber} has no registered WhatsApp sender; inbound messages will not reach Pulsar until one is registered`,
        );
        return;
      }
      if (sender.inboundWebhookUrl !== expectedWebhookUrl) {
        this.logger.warn(
          `WhatsApp sender ${sender.sid} for ${phoneNumber} points at ${
            sender.inboundWebhookUrl ?? 'no webhook'
          }; expected ${expectedWebhookUrl}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not verify the WhatsApp sender webhook for ${phoneNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
