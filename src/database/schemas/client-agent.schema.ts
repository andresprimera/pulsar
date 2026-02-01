import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'client_agents', timestamps: true })
export class ClientAgent extends Document {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  agentId: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({ required: true, min: 0 })
  price: number;

  createdAt: Date;
  updatedAt: Date;
}

export const ClientAgentSchema = SchemaFactory.createForClass(ClientAgent);
