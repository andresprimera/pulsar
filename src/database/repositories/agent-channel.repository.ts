import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async findByPhoneNumberId(phoneNumberId: string): Promise<AgentChannel | null> {
    return this.model
      .findOne({
        'channelConfig.phoneNumberId': phoneNumberId,
        status: 'active',
      })
      .exec();
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

  async create(data: Partial<AgentChannel>): Promise<AgentChannel> {
    const agentChannel = new this.model(data);
    return agentChannel.save();
  }
}
