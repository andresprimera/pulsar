import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { ClientAgent } from '../schemas/client-agent.schema';

@Injectable()
export class ClientAgentRepository {
  constructor(
    @InjectModel(ClientAgent.name)
    private readonly model: Model<ClientAgent>,
  ) {}

  async findById(id: string): Promise<ClientAgent | null> {
    return this.model.findById(id).exec();
  }

  async findAll(): Promise<ClientAgent[]> {
    return this.model.find().exec();
  }

  async create(data: Partial<ClientAgent>, session?: ClientSession): Promise<ClientAgent> {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  async findByClient(clientId: string): Promise<ClientAgent[]> {
    return this.model.find({ clientId }).exec();
  }

  async findByClientAndAgent(
    clientId: string,
    agentId: string,
  ): Promise<ClientAgent | null> {
    return this.model.findOne({ clientId, agentId }).exec();
  }

  async findByClientAndStatus(
    clientId: string,
    status: 'active' | 'inactive' | 'archived',
  ): Promise<ClientAgent[]> {
    return this.model.find({ clientId, status }).exec();
  }

  async update(id: string, data: Partial<ClientAgent>): Promise<ClientAgent | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}
