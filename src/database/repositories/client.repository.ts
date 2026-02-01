import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Client } from '../schemas/client.schema';

@Injectable()
export class ClientRepository {
  constructor(
    @InjectModel(Client.name)
    private readonly model: Model<Client>,
  ) {}

  async findById(id: string): Promise<Client | null> {
    return this.model.findById(id).exec();
  }

  async findAll(): Promise<Client[]> {
    return this.model.find().exec();
  }
}
