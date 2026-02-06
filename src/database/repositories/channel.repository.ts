import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Channel } from '../schemas/channel.schema';

@Injectable()
export class ChannelRepository {
  constructor(
    @InjectModel(Channel.name)
    private readonly model: Model<Channel>,
  ) {}

  async findById(id: string): Promise<Channel | null> {
    return this.model.findById(id).exec();
  }

  async findOrCreateByName(
    name: string,
    data?: Partial<Channel>,
    session?: ClientSession,
  ): Promise<Channel> {
    return this.model
      .findOneAndUpdate(
        { name },
        { $setOnInsert: { ...data, name } },
        { upsert: true, new: true, session },
      )
      .exec();
  }

  async findAll(): Promise<Channel[]> {
    return this.model.find().exec();
  }
  async create(data: Partial<Channel>): Promise<Channel> {
    const channel = new this.model(data);
    return channel.save();
  }
}
