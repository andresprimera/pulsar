export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
  llmOverride?: {
    provider: string;
    model: string;
  };
}
