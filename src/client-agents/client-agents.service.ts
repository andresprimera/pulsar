import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';
import { ClientsService } from '../clients/clients.service';
import { AgentsService } from '../agents/agents.service';
import { ClientAgent } from '../database/schemas/client-agent.schema';

@Injectable()
export class ClientAgentsService {
  constructor(
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly clientsService: ClientsService,
    private readonly agentsService: AgentsService,
  ) {}

  async create(data: CreateClientAgentDto): Promise<ClientAgent> {
    const client = await this.clientsService.findOne(data.clientId);
    if (!client || client.status === 'archived') {
      throw new BadRequestException('Client not found or archived');
    }

    const agent = await this.agentsService.findOne(data.agentId);
    if (!agent || agent.status === 'archived') {
      throw new BadRequestException('Agent not found or archived');
    }

    return this.clientAgentRepository.create({
      ...data,
      status: 'active',
    });
  }

  async findByClient(clientId: string): Promise<ClientAgent[]> {
    return this.clientAgentRepository.findByClient(clientId);
  }

  async update(id: string, data: UpdateClientAgentDto): Promise<ClientAgent> {
    const clientAgent = await this.clientAgentRepository.findById(id);
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }

    if (clientAgent.status === 'archived') {
      throw new BadRequestException('Cannot update archived ClientAgent');
    }

    const updated = await this.clientAgentRepository.update(id, data);
    return updated!; // non-null assertion because we checked existence
  }

  async updateStatus(id: string, data: UpdateClientAgentStatusDto): Promise<ClientAgent> {
    const clientAgent = await this.clientAgentRepository.findById(id);
    if (!clientAgent) {
      throw new NotFoundException('ClientAgent not found');
    }

    if (clientAgent.status === 'archived') {
      throw new BadRequestException('Cannot modify archived ClientAgent');
    }

    const updated = await this.clientAgentRepository.update(id, { status: data.status });
    return updated!;
  }

  async calculateClientTotal(clientId: string): Promise<number> {
    const activeClientAgents = await this.clientAgentRepository.findByClientAndStatus(clientId, 'active');
    return activeClientAgents.reduce((total, ca) => total + ca.price, 0);
  }
}
