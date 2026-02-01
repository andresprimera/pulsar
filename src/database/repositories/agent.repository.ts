import { Injectable } from '@nestjs/common';
import { Agent } from '../entities/agent.entity';

const MOCK_DATA: Agent[] = [
  {
    id: 'agent-1',
    name: 'Support Bot',
    systemPrompt: 'You are a helpful support assistant.',
  },
];

@Injectable()
export class AgentRepository {
  async findById(id: string): Promise<Agent | undefined> {
    return MOCK_DATA.find((a) => a.id === id);
  }

  async findAll(): Promise<Agent[]> {
    return MOCK_DATA;
  }
}
