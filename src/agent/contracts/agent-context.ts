export interface AgentContext {
  agentId: string;
  clientId: string;
  channelType: string;
  systemPrompt: string;
  llmConfig: {
    provider: string;
    apiKey: string;
    model: string;
  };
  channelConfig?: Record<string, unknown>;
}
