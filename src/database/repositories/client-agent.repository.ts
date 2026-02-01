import { Injectable } from '@nestjs/common';
import { ClientAgent } from '../entities/client-agent.entity';

const MOCK_DATA: ClientAgent[] = [
  {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    enabled: true,
  },
];

@Injectable()
export class ClientAgentRepository {
  async findById(id: string): Promise<ClientAgent | undefined> {
    return MOCK_DATA.find((ca) => ca.id === id);
  }

  async findAll(): Promise<ClientAgent[]> {
    return MOCK_DATA;
  }

  async findByClientId(clientId: string): Promise<ClientAgent[]> {
    return MOCK_DATA.filter((ca) => ca.clientId === clientId);
  }
}
