import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ClientPhone } from '../schemas/client-phone.schema';

export interface CreateClientPhoneData {
  clientId: Types.ObjectId | string;
  phoneNumberId: string;
  provider?: 'meta' | 'twilio' | 'custom';
  metadata?: Record<string, any>;
}

@Injectable()
export class ClientPhoneRepository {
  constructor(
    @InjectModel(ClientPhone.name)
    private readonly model: Model<ClientPhone>,
  ) {}

  /**
   * Create a new ClientPhone record.
   * Fails with duplicate key error if (clientId, phoneNumberId) already exists.
   */
  async create(
    data: CreateClientPhoneData,
    session?: ClientSession,
  ): Promise<ClientPhone> {
    const clientId =
      typeof data.clientId === 'string'
        ? new Types.ObjectId(data.clientId)
        : data.clientId;

    const [doc] = await this.model.create(
      [
        {
          clientId,
          phoneNumberId: data.phoneNumberId,
          provider: data.provider,
          metadata: data.metadata,
        },
      ],
      { session },
    );
    return doc;
  }

  /**
   * Find a ClientPhone by client and phone number.
   * Used for resolving existing ownership within a client.
   */
  async findByClientAndPhoneNumber(
    clientId: Types.ObjectId | string,
    phoneNumberId: string,
    session?: ClientSession,
  ): Promise<ClientPhone | null> {
    const clientObjectId =
      typeof clientId === 'string' ? new Types.ObjectId(clientId) : clientId;

    return this.model
      .findOne({ clientId: clientObjectId, phoneNumberId })
      .session(session || null)
      .exec();
  }

  /**
   * Find a ClientPhone by phone number (global lookup).
   * Used to check if a phone is already owned by ANY client.
   * This is the enforcement point for cross-client uniqueness.
   */
  async findByPhoneNumber(phoneNumberId: string): Promise<ClientPhone | null> {
    return this.model.findOne({ phoneNumberId }).exec();
  }

  /**
   * Find a ClientPhone by its ID.
   */
  async findById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ClientPhone | null> {
    return this.model.findById(id).session(session || null).exec();
  }

  /**
   * Resolve or create a ClientPhone for a client.
   * - If phone exists for this client, return it
   * - If phone exists for another client, throw error
   * - If phone doesn't exist, create it
   */
  async resolveOrCreate(
    clientId: Types.ObjectId | string,
    phoneNumberId: string,
    options?: {
      provider?: 'meta' | 'twilio' | 'custom';
      metadata?: Record<string, any>;
      session?: ClientSession;
    },
  ): Promise<ClientPhone> {
    const clientObjectId =
      typeof clientId === 'string' ? new Types.ObjectId(clientId) : clientId;

    // Check if this phone is already owned
    const existing = await this.model
      .findOne({ phoneNumberId })
      .session(options?.session || null)
      .exec();

    if (existing) {
      // Check if owned by the same client
      if (existing.clientId.toString() === clientObjectId.toString()) {
        return existing;
      }
      // Owned by different client - reject
      throw new Error(
        `Phone number ${phoneNumberId} is already owned by another client`,
      );
    }

    // Not owned - create new
    return this.create(
      {
        clientId: clientObjectId,
        phoneNumberId,
        provider: options?.provider,
        metadata: options?.metadata,
      },
      options?.session,
    );
  }

  /**
   * Find all phones owned by a client.
   */
  async findByClient(
    clientId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ClientPhone[]> {
    const clientObjectId =
      typeof clientId === 'string' ? new Types.ObjectId(clientId) : clientId;

    return this.model
      .find({ clientId: clientObjectId })
      .session(session || null)
      .exec();
  }

  /**
   * Delete all phones for a client (used for cleanup).
   */
  async deleteByClient(
    clientId: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<number> {
    const clientObjectId =
      typeof clientId === 'string' ? new Types.ObjectId(clientId) : clientId;

    const result = await this.model.deleteMany(
      { clientId: clientObjectId },
      { session },
    );
    return result.deletedCount;
  }
}
