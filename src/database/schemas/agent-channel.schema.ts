import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'agent_channels' })
export class AgentChannel extends Document {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  agentId: string;

  @Prop({ required: true, enum: ['whatsapp'] })
  channelType: 'whatsapp';

  @Prop({ required: true, default: true })
  enabled: boolean;

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

// Critical index for WhatsApp webhook resolution
AgentChannelSchema.index({ 'channelConfig.phoneNumberId': 1, enabled: 1 });
