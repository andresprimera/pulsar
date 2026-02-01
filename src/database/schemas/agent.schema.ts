import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'agents', timestamps: true })
export class Agent extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({ type: Object })
  llmOverride?: {
    provider: string;
    model: string;
  };

  @Prop({ default: false })
  createdBySeeder: boolean;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);
