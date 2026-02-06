import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * ClientPhone - Client-scoped phone number ownership.
 *
 * Business Rules:
 * - A phone number belongs to exactly one Client
 * - Can be reused by multiple Agents within the same client
 * - Can be reused by multiple Channels within the same client
 * - Must NOT be reused across different Clients
 *
 * Uniqueness is enforced via compound index (clientId, phoneNumberId).
 * Cross-client uniqueness is enforced at the service layer via findByPhoneNumber.
 */
@Schema({ collection: 'client_phones', timestamps: true })
export class ClientPhone extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  phoneNumberId: string;

  @Prop({ enum: ['meta', 'twilio', 'custom'] })
  provider?: 'meta' | 'twilio' | 'custom';

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

export const ClientPhoneSchema = SchemaFactory.createForClass(ClientPhone);

// Compound unique index: ensures one phone per client (no duplicates within a client)
ClientPhoneSchema.index({ clientId: 1, phoneNumberId: 1 }, { unique: true });
