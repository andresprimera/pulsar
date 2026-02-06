import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'agent_channels' })
export class AgentChannel extends Document {
  @Prop({ required: true, index: true })
  clientId: string;

  @Prop({ required: true, index: true })
  agentId: string;

  @Prop({ required: true, index: true })
  channelId: string;

  @Prop({ required: true, enum: ['active', 'inactive', 'archived'], default: 'active' })
  status: 'active' | 'inactive' | 'archived';

  /**
   * Reference to ClientPhone for phone-based channels.
   * Required for whatsapp/telegram channels.
   * Phone number ownership is enforced via ClientPhone collection.
   */
  @Prop({ type: Types.ObjectId, index: true })
  clientPhoneId?: Types.ObjectId;

  /**
   * Channel-specific configuration (excluding phone number).
   * Phone numbers are now referenced via clientPhoneId.
   */
  @Prop({ type: Object, required: true })
  channelConfig: {
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

// Enforce uniqueness for Client + Agent + Channel (Multi-Tenant)
AgentChannelSchema.index({ clientId: 1, agentId: 1, channelId: 1 }, { unique: true });

// Index for efficient phone lookups (routing webhooks)
AgentChannelSchema.index({ clientPhoneId: 1 });
