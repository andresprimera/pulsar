import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'clients' })
export class Client extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['active', 'suspended'] })
  status: 'active' | 'suspended';

  @Prop({ type: Object })
  llmPreferences?: {
    provider: string;
    defaultModel: string;
  };
}

export const ClientSchema = SchemaFactory.createForClass(Client);
