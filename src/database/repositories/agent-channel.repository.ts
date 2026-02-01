import { Injectable } from '@nestjs/common';
import { AgentChannel } from '../entities/agent-channel.entity';

const MOCK_DATA: AgentChannel[] = [
  {
    id: 'ac-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    channelType: 'whatsapp',
    enabled: true,
    channelConfig: {
      phoneNumberId: 'phone123',
      accessToken: 'mock-token',
      webhookVerifyToken: 'test-token',
    },
    llmConfig: {
      provider: 'openai',
      apiKey: 'sk-mock-key',
      model: 'gpt-4',
    },
  },
];

@Injectable()
export class AgentChannelRepository {
  async findById(id: string): Promise<AgentChannel | undefined> {
    return MOCK_DATA.find((ac) => ac.id === id);
  }

  async findAll(): Promise<AgentChannel[]> {
    return MOCK_DATA;
  }

  async findByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<AgentChannel | undefined> {
    return MOCK_DATA.find(
      (ac) =>
        ac.channelType === 'whatsapp' &&
        ac.channelConfig.phoneNumberId === phoneNumberId &&
        ac.enabled,
    );
  }
}
