import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AgentChannel } from '../schemas/agent-channel.schema';

@Injectable()
export class AgentChannelRepository {
  constructor(
    @InjectModel(AgentChannel.name)
    private readonly model: Model<AgentChannel>,
  ) {}

  async findById(id: string): Promise<AgentChannel | null> {
    return this.model.findById(id).exec();
  }

  async findAll(): Promise<AgentChannel[]> {
    return this.model.find().exec();
  }

  /**
   * Find AgentChannel by clientPhoneId.
   * Used for routing webhooks to the correct agent channel.
   */
  async findByClientPhoneId(
    clientPhoneId: Types.ObjectId | string,
    options?: { clientId?: string; session?: ClientSession },
  ): Promise<AgentChannel | null> {
    const phoneObjectId =
      typeof clientPhoneId === 'string'
        ? new Types.ObjectId(clientPhoneId)
        : clientPhoneId;

    const query: Record<string, any> = {
      clientPhoneId: phoneObjectId,
    };
    if (options?.clientId) {
      query.clientId = options.clientId;
    }
    return this.model.findOne(query).session(options?.session || null).exec();
  }

  /**
   * Find all AgentChannels by clientPhoneId.
   * Returns multiple since same phone can be used by multiple agents/channels.
   */
  async findAllByClientPhoneId(
    clientPhoneId: Types.ObjectId | string,
    options?: { clientId?: string; session?: ClientSession },
  ): Promise<AgentChannel[]> {
    const phoneObjectId =
      typeof clientPhoneId === 'string'
        ? new Types.ObjectId(clientPhoneId)
        : clientPhoneId;

    const query: Record<string, any> = {
      clientPhoneId: phoneObjectId,
    };
    if (options?.clientId) {
      query.clientId = options.clientId;
    }
    return this.model.find(query).session(options?.session || null).exec();
  }
  async findByKeys(clientId: string, agentId: string, channelId: string): Promise<AgentChannel | null> {
    return this.model.findOne({ clientId, agentId, channelId }).exec();
  }

  async findOrCreate(data: Partial<AgentChannel>): Promise<AgentChannel> {
    const { clientId, agentId, channelId } = data;
    if (!clientId || !agentId || !channelId) {
      throw new Error('clientId, agentId, and channelId are required for findOrCreate');
    }
    return this.model
      .findOneAndUpdate(
        { clientId, agentId, channelId },
        { $setOnInsert: data },
        { upsert: true, new: true },
      )
      .exec();
  }

  async create(data: Partial<AgentChannel>, session?: ClientSession): Promise<AgentChannel> {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /**
   * Archive all AgentChannels for a given client-agent pair.
   * Called when a ClientAgent relationship is archived.
   */
  async archiveByClientAndAgent(clientId: string, agentId: string): Promise<number> {
    const result = await this.model.updateMany(
      { clientId, agentId, status: { $ne: 'archived' } },
      { $set: { status: 'archived' } },
    );
    return result.modifiedCount;
  }
}
