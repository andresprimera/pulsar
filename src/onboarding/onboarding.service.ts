import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { RegisterAndHireDto } from './dto/register-and-hire.dto';
import { ClientRepository } from '../database/repositories/client.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { AgentRepository } from '../database/repositories/agent.repository';
import { ChannelRepository } from '../database/repositories/channel.repository';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { AgentChannelRepository } from '../database/repositories/agent-channel.repository';
import { ClientPhoneRepository } from '../database/repositories/client-phone.repository';

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
  };
  clientAgent: {
    _id: string;
    clientId: string;
    agentId: string;
    price: number;
    status: string;
  };
  agentChannels: Array<{
    _id: string;
    clientId: string;
    agentId: string;
    channelId: string;
    status: string;
    channelConfig: Record<string, any>;
    llmConfig: {
      provider: string;
      model: string;
    };
  }>;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly clientRepository: ClientRepository,
    private readonly userRepository: UserRepository,
    private readonly agentRepository: AgentRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly agentChannelRepository: AgentChannelRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
  ) {}

  async registerAndHire(dto: RegisterAndHireDto): Promise<RegisterAndHireResult> {
    // PRE-TRANSACTION VALIDATIONS (fail fast, no rollback needed)

    // 1. Normalize email
    const normalizedEmail = dto.user.email.toLowerCase().trim();

    // 2. Check user email doesn't exist
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // 3. Validate agent is hireable
    await this.agentRepository.validateHireable(dto.agentHiring.agentId);

    // 4. Validate client name for organization type
    if (dto.client.type === 'organization' && !dto.client.name) {
      throw new BadRequestException('Client name is required for organization type');
    }

    // 5. Pre-validate channels
    await this.validateChannels(dto.channels);

    // TRANSACTION (atomic writes)
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 6. Create Client
      const clientName = dto.client.name || dto.user.name;
      const client = await this.clientRepository.create(
        {
          name: clientName,
          type: dto.client.type,
          status: 'active',
        },
        session,
      );

      // 7. Create User
      const user = await this.userRepository.create(
        {
          email: normalizedEmail,
          name: dto.user.name,
          clientId: client._id as Types.ObjectId,
          status: 'active',
        },
        session,
      );

      // 8. Update Client with ownerUserId
      await this.clientRepository.update(
        (client._id as Types.ObjectId).toString(),
        { ownerUserId: user._id as Types.ObjectId },
        session,
      );

      // 9. Create ClientAgent (pricing snapshot)
      const clientAgent = await this.clientAgentRepository.create(
        {
          clientId: (client._id as Types.ObjectId).toString(),
          agentId: dto.agentHiring.agentId,
          price: dto.agentHiring.price,
          status: 'active',
        },
        session,
      );

      // 10. Resolve Channels and create AgentChannels
      const agentChannels = [];
      for (const channelDto of dto.channels) {
        // Resolve channel (find or create by name)
        const channel = await this.channelRepository.findOrCreateByName(
          channelDto.name,
          {
            type: channelDto.type,
            provider: channelDto.provider || 'custom',
          },
          session,
        );

        // Extract phoneNumberId from channelConfig and resolve ClientPhone
        const { phoneNumberId, ...channelConfigWithoutPhone } =
          channelDto.agentChannelConfig.channelConfig as Record<string, any>;

        let clientPhoneId: Types.ObjectId | undefined;
        if (phoneNumberId) {
          // Resolve or create ClientPhone for this client
          const clientPhone = await this.clientPhoneRepository.resolveOrCreate(
            client._id as Types.ObjectId,
            phoneNumberId,
            {
              provider: channelDto.provider,
              session,
            },
          );
          clientPhoneId = clientPhone._id as Types.ObjectId;
        }

        // Create AgentChannel with clientPhoneId reference
        const agentChannel = await this.agentChannelRepository.create(
          {
            clientId: (client._id as Types.ObjectId).toString(),
            agentId: dto.agentHiring.agentId,
            channelId: (channel._id as Types.ObjectId).toString(),
            status: channelDto.agentChannelConfig.status || 'active',
            clientPhoneId,
            channelConfig: channelConfigWithoutPhone as any,
            llmConfig: channelDto.agentChannelConfig.llmConfig,
          },
          session,
        );

        agentChannels.push(agentChannel);
      }

      // 12. Commit transaction
      await session.commitTransaction();

      // 13. Sanitize response (remove apiKey)
      const sanitizedAgentChannels = agentChannels.map((ac) => {
        const obj = ac.toObject();
        return {
          _id: obj._id.toString(),
          clientId: obj.clientId,
          agentId: obj.agentId,
          channelId: obj.channelId,
          status: obj.status,
          channelConfig: obj.channelConfig,
          llmConfig: {
            provider: obj.llmConfig.provider,
            model: obj.llmConfig.model,
          },
        };
      });

      // 14. Return response
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
        },
        clientAgent: {
          _id: (clientAgent._id as Types.ObjectId).toString(),
          clientId: clientAgent.clientId,
          agentId: clientAgent.agentId,
          price: clientAgent.price,
          status: clientAgent.status,
        },
        agentChannels: sanitizedAgentChannels,
      };
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();

      // Map MongoDB 11000 (duplicate key) to 409 Conflict
      if (this.isDuplicateKeyError(error)) {
        const field = this.extractDuplicateField(error);
        throw new ConflictException(`Duplicate value for field: ${field}`);
      }

      // Re-throw other errors
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async validateChannels(
    channels: RegisterAndHireDto['channels'],
  ): Promise<void> {
    // 1. No duplicate channel names in same request
    const names = channels.map((c) => c.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Duplicate channel names in request');
    }

    // 2. Check phone numbers aren't already owned by another client
    // NOTE: Same phone CAN be used by multiple channels of the same client
    // Ownership is enforced ONLY via ClientPhone collection
    const phoneNumberIds = channels
      .filter((c) => c.agentChannelConfig.channelConfig?.phoneNumberId)
      .map((c) => c.agentChannelConfig.channelConfig.phoneNumberId);

    // Deduplicate for ownership check (no need to check same phone twice)
    const uniquePhoneNumberIds = [...new Set(phoneNumberIds)];

    for (const phoneNumberId of uniquePhoneNumberIds) {
      const owner = await this.clientPhoneRepository.findByPhoneNumber(phoneNumberId);
      if (owner) {
        throw new ConflictException(
          `Phone number ${phoneNumberId} is already owned by another client`,
        );
      }
    }
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
