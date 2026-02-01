import { Injectable } from '@nestjs/common';
import { Client } from '../entities/client.entity';

const MOCK_DATA: Client[] = [
  {
    id: 'client-1',
    name: 'Acme Corp',
    status: 'active',
    llmPreferences: {
      provider: 'openai',
      defaultModel: 'gpt-4',
    },
  },
];

@Injectable()
export class ClientRepository {
  async findById(id: string): Promise<Client | undefined> {
    return MOCK_DATA.find((c) => c.id === id);
  }

  async findAll(): Promise<Client[]> {
    return MOCK_DATA;
  }
}
