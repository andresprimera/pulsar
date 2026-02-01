export interface AgentContext {
  agentId: string;
  clientId: string;
  channelType: string;
  systemPrompt: string;
  llmConfig: {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model: string;
  };
  channelConfig?: Record<string, unknown>;
}
