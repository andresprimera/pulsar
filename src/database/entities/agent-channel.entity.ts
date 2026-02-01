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
    provider: string;
    apiKey: string;
    model: string;
  };
}
