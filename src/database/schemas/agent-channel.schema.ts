import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'agent_channels' })
export class AgentChannel extends Document {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  agentId: string;

  @Prop({ required: true, index: true })
  channelId: string;

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';

  @Prop({ type: Object, required: true })
  channelConfig: {
    phoneNumberId: string;
    accessToken: string;
    webhookVerifyToken: string;
  };

  @Prop({ type: Object, required: true })
  llmConfig: {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model: string;
  };
}

export const AgentChannelSchema = SchemaFactory.createForClass(AgentChannel);

// Critical: Enforce global uniqueness for WhatsApp phone number to ensure safe webhook routing
AgentChannelSchema.index({ 'channelConfig.phoneNumberId': 1 }, { unique: true });

// Enforce uniqueness for Client + Agent + Channel (Multi-Tenant)
AgentChannelSchema.index({ clientId: 1, agentId: 1, channelId: 1 }, { unique: true });
