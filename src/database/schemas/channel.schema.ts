import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'channels' })
export class Channel extends Document {
  @Prop({ required: true, enum: ['whatsapp', 'telegram', 'web', 'api'] })
  type: 'whatsapp' | 'telegram' | 'web' | 'api';

  @Prop({ required: true, enum: ['meta', 'twilio', 'custom'] })
  provider: 'meta' | 'twilio' | 'custom';
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
