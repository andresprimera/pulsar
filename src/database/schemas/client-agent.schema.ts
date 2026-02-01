import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'client_agents' })
export class ClientAgent extends Document {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  agentId: string;

  @Prop({ required: true, default: true })
  enabled: boolean;
}

export const ClientAgentSchema = SchemaFactory.createForClass(ClientAgent);
