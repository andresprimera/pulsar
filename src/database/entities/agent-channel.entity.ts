export interface AgentChannel {
  id: string;
  clientId: string;
  agentId: string;
  channelType: 'whatsapp';
  enabled: boolean;
  channelConfig: {
    phoneNumberId: string;
    accessToken: string;
    webhookVerifyToken: string;
  };
  llmConfig: {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model: string;
  };
}
