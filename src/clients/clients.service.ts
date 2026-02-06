import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ClientRepository } from '../database/repositories/client.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientStatusDto } from './dto/update-client-status.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async create(dto: CreateClientDto) {
    return this.clientRepository.create({
      ...dto,
      status: 'active',
    });
  }

  async findAll(status?: 'active' | 'inactive' | 'archived') {
    if (status) {
      return this.clientRepository.findByStatus(status);
    }
    return this.clientRepository.findAll();
  }

  async findById(id: string) {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    const existing = await this.findById(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived clients cannot be modified');
    }

    const client = await this.clientRepository.update(id, dto);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async updateStatus(id: string, dto: UpdateClientStatusDto) {
    const existing = await this.findById(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived clients cannot be modified');
    }

    const client = await this.clientRepository.update(id, {
      status: dto.status,
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }
}
