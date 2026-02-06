import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Client } from '../schemas/client.schema';

@Injectable()
export class ClientRepository {
  constructor(
    @InjectModel(Client.name)
    private readonly model: Model<Client>,
  ) {}

  async create(data: Partial<Client>, session?: ClientSession): Promise<Client> {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  async findAll(): Promise<Client[]> {
    return this.model.find().exec();
  }

  async findById(id: string): Promise<Client | null> {
    return this.model.findById(id).exec();
  }

  async findByStatus(
    status: 'active' | 'inactive' | 'archived',
  ): Promise<Client[]> {
    return this.model.find({ status }).exec();
  }

  async update(
    id: string,
    data: Partial<Client>,
    session?: ClientSession,
  ): Promise<Client | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true })
      .session(session)
      .exec();
  }
}
