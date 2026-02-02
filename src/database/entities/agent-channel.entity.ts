export interface AgentChannel {
  id: string;
  clientId: string;
  channelId: string;
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
