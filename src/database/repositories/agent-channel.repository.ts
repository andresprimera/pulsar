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
        channelType: 'whatsapp',
        'channelConfig.phoneNumberId': phoneNumberId,
        enabled: true,
      })
      .exec();
  }
}
