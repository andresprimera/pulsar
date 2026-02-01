import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AgentRepository } from '../database/repositories/agent.repository';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly agentRepository: AgentRepository) {}

  async create(dto: CreateAgentDto) {
    return this.agentRepository.create({
      ...dto,
      status: 'active',
    });
  }

  async findAll(status?: 'active' | 'inactive' | 'archived') {
    if (status) {
      return this.agentRepository.findByStatus(status);
    }
    return this.agentRepository.findAll();
  }

  async findAvailable() {
    return this.agentRepository.findByStatus('active');
  }

  async findOne(id: string) {
    const agent = await this.agentRepository.findById(id);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  async update(id: string, dto: UpdateAgentDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived agents cannot be modified');
    }

    const agent = await this.agentRepository.update(id, dto);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  async updateStatus(id: string, dto: UpdateAgentStatusDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived agents cannot be modified');
    }

    const agent = await this.agentRepository.update(id, { status: dto.status });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }
}
