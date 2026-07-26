import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ClientPhone } from '@persistence/schemas/client-phone.schema';
import {
  normalizeRoutingIdentifier,
  routingIdentifierLookupValues,
} from '@shared/e164.util';

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
    const phoneNumberId = normalizeRoutingIdentifier(
      data.provider,
      data.phoneNumberId,
    );

    const opts = session ? { session } : {};
    const [doc] = await this.model.create(
      [
        {
          clientId,
          phoneNumberId,
          provider: data.provider,
          metadata: data.metadata,
        },
      ],
      opts,
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
    const candidates = routingIdentifierLookupValues(phoneNumberId);

    const query = this.model.findOne({
      clientId: clientObjectId,
      phoneNumberId: { $in: candidates },
    });
    return (session ? query.session(session) : query).exec();
  }

  /**
   * Find a ClientPhone by phone number (global lookup).
   * Used to check if a phone is already owned by ANY client.
   * This is the enforcement point for cross-client uniqueness.
   */
  async findByPhoneNumber(phoneNumberId: string): Promise<ClientPhone | null> {
    const candidates = routingIdentifierLookupValues(phoneNumberId);
    return this.model.findOne({ phoneNumberId: { $in: candidates } }).exec();
  }

  /**
   * Find ClientPhones for a set of phone numbers (global lookup).
   * Used to report which platform-owned numbers are already assigned.
   */
  async findByPhoneNumbers(phoneNumberIds: string[]): Promise<ClientPhone[]> {
    if (!phoneNumberIds.length) {
      return [];
    }
    const candidates = [
      ...new Set(phoneNumberIds.flatMap(routingIdentifierLookupValues)),
    ];
    return this.model.find({ phoneNumberId: { $in: candidates } }).exec();
  }

  /**
   * Find a ClientPhone by its ID.
   */
  async findById(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<ClientPhone | null> {
    const query = this.model.findById(id);
    return (session ? query.session(session) : query).exec();
  }

  /**
   * Resolve or create a ClientPhone for a client.
   * - If phone exists for this client, return it
   * - If phone exists for another client, throw error
   * - If phone doesn't exist, create it
   *
   * Uses a pre-check pattern to avoid transaction boundary leaks.
   * The unique index on phoneNumberId still protects against races.
   *
   * EDGE-2 safety: Because all operations (read + create) run within
   * the same session, if the transaction aborts, both the ClientPhone
   * and any other writes are rolled back atomically. No orphans possible.
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
    const canonical = normalizeRoutingIdentifier(
      options?.provider,
      phoneNumberId,
    );
    const candidates = routingIdentifierLookupValues(phoneNumberId);

    // Pre-check: does this phone already exist?
    // This runs inside the session so it respects the transaction snapshot.
    const findQuery = this.model.findOne({
      phoneNumberId: { $in: candidates },
    });
    const existing = await (options?.session
      ? findQuery.session(options.session)
      : findQuery
    ).exec();

    if (existing) {
      // If owned by THIS client, return it (idempotent success)
      if (existing.clientId.toString() === clientObjectId.toString()) {
        return existing;
      }

      // If owned by ANOTHER client, throw Conflict
      throw new ConflictException(
        `Phone number ${canonical} is already owned by another client`,
      );
    }

    // Phone doesn't exist yet — create it within the transaction.
    // If a race condition causes E11000, it will abort the transaction
    // and bubble up as a ConflictException from the onboarding service.
    return this.create(
      {
        clientId: clientObjectId,
        phoneNumberId: canonical,
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

    const query = this.model.find({ clientId: clientObjectId });
    return (session ? query.session(session) : query).exec();
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
      session ? { session } : {},
    );
    return result.deletedCount;
  }
}
