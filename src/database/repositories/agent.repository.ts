import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent } from '../schemas/agent.schema';

@Injectable()
export class AgentRepository {
  constructor(
    @InjectModel(Agent.name)
    private readonly model: Model<Agent>,
  ) {}

  async findById(id: string): Promise<Agent | null> {
    return this.model.findById(id).exec();
  }

  async findAll(): Promise<Agent[]> {
    return this.model.find().exec();
  }

  async findActiveById(id: string): Promise<Agent | null> {
    return this.model.findOne({ _id: id, status: 'active' }).exec();
  }

  async findAllActive(): Promise<Agent[]> {
    return this.model.find({ status: 'active' }).exec();
  }

  /**
   * Validates that an agent exists and is active (hireable).
   * Use this when creating new AgentChannel bindings.
   * Throws BadRequestException if agent cannot be hired.
   */
  async validateHireable(agentId: string): Promise<Agent> {
    const agent = await this.model.findById(agentId).exec();

    if (!agent) {
      console.log(`[Agent] Hire rejected - agent ${agentId} not found`);
      throw new BadRequestException('Agent not found');
    }

    if (agent.status !== 'active') {
      console.log(`[Agent] Hire rejected - agent ${agentId} status: ${agent.status}`);
      throw new BadRequestException('Agent is not currently available');
    }

    return agent;
  }
}
