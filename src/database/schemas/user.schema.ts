import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true,
  })
  clientId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';
}

export const UserSchema = SchemaFactory.createForClass(User);
