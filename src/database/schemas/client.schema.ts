import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'clients', timestamps: true })

export class Client extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';


  @Prop({ type: Object })
  llmPreferences?: {
    provider: string;
    defaultModel: string;
  };
}

export const ClientSchema = SchemaFactory.createForClass(Client);
