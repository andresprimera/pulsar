export interface Client {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  llmPreferences?: {
    provider: string;
    defaultModel: string;
  };
}
