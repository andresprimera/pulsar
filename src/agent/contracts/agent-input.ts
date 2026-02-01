export interface AgentInput {
  channel: string;
  externalUserId: string;
  conversationId: string;
  message: {
    type: 'text';
    text: string;
  };
  metadata?: Record<string, unknown>;
}
