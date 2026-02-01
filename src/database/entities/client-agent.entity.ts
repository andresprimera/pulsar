export interface ClientAgent {
  id: string;
  clientId: string;
  agentId: string;
  status: 'active' | 'inactive' | 'archived';
  price: number;
  createdAt: Date;
  updatedAt: Date;
}
