import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { AgentsService } from '@agents/agents.service';
import { ClientsService } from '@clients/clients.service';
import { ChannelRepository } from '@persistence/repositories/channel.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { AgentPriceRepository } from '@persistence/repositories/agent-price.repository';
import { ChannelPriceRepository } from '@persistence/repositories/channel-price.repository';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { HireChannelLifecyclePublisher } from '@orchestrator/lifecycle/hire-channel-lifecycle.publisher';
import { HIRE_CHANNEL_LIFECYCLE_PORT } from '@shared/ports/hire-channel-lifecycle.port';

describe('ClientAgentsService', () => {
  let service: ClientAgentsService;
  let mockClientAgentRepository: any;
  let mockClientsService: any;
  let mockAgentsService: any;
  let mockChannelRepository: any;
  let mockClientPhoneRepository: any;
  let mockAgentPriceRepository: any;
  let mockChannelPriceRepository: any;
  let mockPersonalityRepository: any;
  let mockLifecyclePublisher: any;
  let mockLifecyclePort: any;

  const mockClientAgent = {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    personalityId: 'personality-1',
    status: 'active',
    agentPricing: { amount: 100, currency: 'USD', monthlyTokenQuota: null },
    billingAnchor: new Date(),
  };

  const mockPersonality = {
    _id: 'personality-1',
    name: 'Default',
    promptTemplate: 'Be helpful.',
    status: 'active',
  };

  const mockClient = {
    id: 'client-1',
    status: 'active',
    billingCurrency: 'USD',
  };

  const mockAgent = {
    id: 'agent-1',
    status: 'active',
    monthlyTokenQuota: null,
  };

  beforeEach(async () => {
    mockClientAgentRepository = {
      create: jest.fn(),
      findByClient: jest.fn(),
      findByClientAndAgent: jest.fn(),
      findByClientAndStatus: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      updateWithQuery: jest.fn(),
      countByFilter: jest.fn(),
      findPageWithProjection: jest.fn(),
      findProjectedByClientForClientList: jest.fn(),
    };

    mockClientsService = {
      findById: jest.fn(),
      findManyByIds: jest.fn().mockResolvedValue([]),
    };

    mockAgentsService = {
      findOne: jest.fn(),
      findManyByIds: jest.fn().mockResolvedValue([]),
    };

    mockChannelRepository = {
      findByIdOrFail: jest.fn(),
    };

    mockClientPhoneRepository = {
      resolveOrCreate: jest.fn(),
    };

    mockAgentPriceRepository = {
      findActiveByAgentAndCurrency: jest
        .fn()
        .mockResolvedValue({ amount: 100 }),
    };

    mockChannelPriceRepository = {
      findActiveByChannelAndCurrency: jest
        .fn()
        .mockResolvedValue({ amount: 0 }),
    };

    mockPersonalityRepository = {
      findActiveById: jest.fn().mockResolvedValue(mockPersonality),
      findManyByIds: jest.fn().mockResolvedValue([]),
    };

    mockLifecyclePublisher = {
      publishHappyPath: jest.fn().mockResolvedValue(undefined),
      publishProbe: jest.fn().mockResolvedValue(undefined),
    };

    mockLifecyclePort = {
      recordOutcome: jest.fn().mockResolvedValue({ matched: true }),
      loadForRegistration: jest.fn(),
      quarantineTelegramRegistration: jest
        .fn()
        .mockResolvedValue({ matched: true }),
      findReconcilableTelegramHires: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAgentsService,
        {
          provide: ClientAgentRepository,
          useValue: mockClientAgentRepository,
        },
        {
          provide: ClientsService,
          useValue: mockClientsService,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
        {
          provide: ChannelRepository,
          useValue: mockChannelRepository,
        },
        {
          provide: ClientPhoneRepository,
          useValue: mockClientPhoneRepository,
        },
        {
          provide: AgentPriceRepository,
          useValue: mockAgentPriceRepository,
        },
        {
          provide: ChannelPriceRepository,
          useValue: mockChannelPriceRepository,
        },
        {
          provide: PersonalityRepository,
          useValue: mockPersonalityRepository,
        },
        {
          provide: HireChannelLifecyclePublisher,
          useValue: mockLifecyclePublisher,
        },
        {
          provide: HIRE_CHANNEL_LIFECYCLE_PORT,
          useValue: mockLifecyclePort,
        },
      ],
    }).compile();

    service = module.get<ClientAgentsService>(ClientAgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const baseDto: any = {
      clientId: '507f1f77bcf86cd799439011',
      agentId: '507f1f77bcf86cd799439012',
      personalityId: '507f1f77bcf86cd799439099',
      channels: [
        {
          channelId: '507f1f77bcf86cd799439013',
          provider: 'instagram',
          credentials: { instagramAccountId: '17841400000000009' },
          llmConfig: {
            provider: 'openai',
            apiKey: 'test-key',
            model: 'gpt-4o',
          },
        },
      ],
    };

    it('should create client agent if client and agent are active', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockAgentPriceRepository.findActiveByAgentAndCurrency.mockResolvedValue({
        amount: 100,
      });
      mockChannelPriceRepository.findActiveByChannelAndCurrency.mockResolvedValue(
        { amount: 0 },
      );
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
        monthlyMessageQuota: null,
      });
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const result = await service.create(baseDto as any);

      expect(mockClientsService.findById).toHaveBeenCalledWith(
        baseDto.clientId,
      );
      expect(mockAgentsService.findOne).toHaveBeenCalledWith(baseDto.agentId);
      expect(
        mockClientAgentRepository.findByClientAndAgent,
      ).toHaveBeenCalledWith(baseDto.clientId, baseDto.agentId);
      expect(mockPersonalityRepository.findActiveById).toHaveBeenCalledWith(
        baseDto.personalityId,
      );
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: baseDto.clientId,
          agentId: baseDto.agentId,
          personalityId: expect.anything(),
          agentPricing: expect.objectContaining({
            amount: 100,
            currency: 'USD',
          }),
          billingAnchor: expect.any(Date),
          status: 'active',
          channels: expect.arrayContaining([
            expect.objectContaining({
              instagramAccountId: '17841400000000009',
              provider: 'instagram',
              amount: 0,
              currency: 'USD',
            }),
          ]),
        }),
      );
      expect(result).toEqual(mockClientAgent);
    });

    it('should throw BadRequestException when no channels are provided', async () => {
      await expect(
        service.create({ ...baseDto, channels: [] } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({ ...baseDto, channels: [] } as any),
      ).rejects.toThrow('At least one channel is required');
    });

    it('should throw BadRequestException if client is not found', async () => {
      mockClientsService.findById.mockResolvedValue(null);

      const dto = { ...baseDto, clientId: 'unknown' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Client not found or not active',
      );
    });

    it('should throw BadRequestException if client is archived', async () => {
      mockClientsService.findById.mockResolvedValue({
        ...mockClient,
        status: 'archived',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if client is inactive', async () => {
      mockClientsService.findById.mockResolvedValue({
        ...mockClient,
        status: 'inactive',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is not found', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(null);

      const dto = { ...baseDto, agentId: 'unknown' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Agent not found or not active',
      );
    });

    it('should throw BadRequestException if agent is archived', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue({
        ...mockAgent,
        status: 'archived',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is inactive', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue({
        ...mockAgent,
        status: 'inactive',
      });

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if personality not found or inactive', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockPersonalityRepository.findActiveById.mockResolvedValue(null);

      await expect(service.create(baseDto as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(baseDto as any)).rejects.toThrow(
        'Personality not found or not active',
      );
    });

    it('should throw ConflictException if agent already hired by client', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(
        mockClientAgent,
      );

      const dto = { ...baseDto };
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for duplicate channel IDs', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });

      const dto = {
        ...baseDto,
        channels: [{ ...baseDto.channels[0] }, { ...baseDto.channels[0] }],
      };

      const createPromise = service.create(dto as any);
      await expect(createPromise).rejects.toThrow(BadRequestException);
      await expect(createPromise).rejects.toThrow(
        'Duplicate channelId in request',
      );
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['meta'],
      });

      await expect(service.create(baseDto as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(baseDto as any)).rejects.toThrow(
        'Provider "instagram" is not supported by channel "Instagram"',
      );
    });

    it('should enforce phone ownership for phoneNumberId channels', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'WhatsApp',
        supportedProviders: ['meta'],
      });

      const conflict = new ConflictException(
        'Phone number phone-1 is already owned by another client',
      );
      mockClientPhoneRepository.resolveOrCreate.mockRejectedValue(conflict);

      const dto = {
        ...baseDto,
        channels: [
          {
            ...baseDto.channels[0],
            provider: 'meta',
            credentials: { phoneNumberId: 'phone-1' },
          },
        ],
      };

      await expect(service.create(dto as any)).rejects.toThrow(
        ConflictException,
      );
      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
        baseDto.clientId,
        'phone-1',
        { provider: 'meta' },
      );
    });

    it('normalizes phoneNumberId to E.164 on the channel and in stored credentials', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'WhatsApp',
        supportedProviders: ['twilio'],
      });
      mockClientPhoneRepository.resolveOrCreate.mockResolvedValue({} as any);
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const dto = {
        ...baseDto,
        channels: [
          {
            ...baseDto.channels[0],
            provider: 'twilio',
            credentials: { phoneNumberId: '14155238886' },
          },
        ],
      };

      await service.create(dto as any);

      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
        baseDto.clientId,
        '+14155238886',
        { provider: 'twilio' },
      );
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: [
            expect.objectContaining({
              phoneNumberId: '+14155238886',
              credentials: expect.objectContaining({
                phoneNumberId: '+14155238886',
              }),
            }),
          ],
        }),
      );
    });

    it('keeps a Cloud API phone_number_id verbatim in stored credentials', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'WhatsApp',
        supportedProviders: ['meta'],
      });
      mockClientPhoneRepository.resolveOrCreate.mockResolvedValue({} as any);
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const dto = {
        ...baseDto,
        channels: [
          {
            ...baseDto.channels[0],
            provider: 'meta',
            credentials: { phoneNumberId: '109384756012345' },
          },
        ],
      };

      await service.create(dto as any);

      // Meta addresses a WABA by an opaque id; a `+` would break Graph calls.
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: [
            expect.objectContaining({
              phoneNumberId: '109384756012345',
              credentials: expect.objectContaining({
                phoneNumberId: '109384756012345',
              }),
            }),
          ],
        }),
      );
    });

    it('should allow re-hiring archived agent relationship', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        supportedProviders: ['instagram'],
      });
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const dto = { ...baseDto };
      const result = await service.create(dto);

      expect(result).toEqual(mockClientAgent);
    });
  });

  describe('findByClient', () => {
    it('returns hydrated, redacted summaries with agent.kind populated', async () => {
      mockClientAgentRepository.findByClient.mockResolvedValue([
        {
          ...mockClientAgent,
          _id: 'ca-1',
          channels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockClientsService.findManyByIds.mockResolvedValue([
        {
          _id: 'client-1',
          name: 'Acme',
          status: 'active',
          billingCurrency: 'USD',
        },
      ]);
      mockAgentsService.findManyByIds.mockResolvedValue([
        {
          _id: 'agent-1',
          name: 'Sales Bot',
          status: 'active',
          kind: 'sales',
        },
      ]);
      mockPersonalityRepository.findManyByIds.mockResolvedValue([
        mockPersonality,
      ]);

      const result = await service.findByClient('client-1');

      expect(mockClientAgentRepository.findByClient).toHaveBeenCalledWith(
        'client-1',
      );
      expect(result).toHaveLength(1);
      expect(result[0].agent).toEqual({
        _id: 'agent-1',
        name: 'Sales Bot',
        status: 'active',
        kind: 'sales',
      });
      // Whitelist redaction stays intact: no credentials/secret/fingerprint/promptSupplement on the row.
      const row = result[0] as unknown as Record<string, unknown>;
      expect(row.credentials).toBeUndefined();
      expect(row.telegramWebhookSecretHex).toBeUndefined();
      expect(row.promptSupplement).toBeUndefined();
    });

    it('returns an empty array when the client has no hires', async () => {
      mockClientAgentRepository.findByClient.mockResolvedValue([]);

      const result = await service.findByClient('client-1');

      expect(result).toEqual([]);
      expect(mockAgentsService.findManyByIds).not.toHaveBeenCalled();
    });

    it('handles missing agent hydration gracefully (agent: null)', async () => {
      mockClientAgentRepository.findByClient.mockResolvedValue([
        {
          ...mockClientAgent,
          _id: 'ca-1',
          channels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockClientsService.findManyByIds.mockResolvedValue([
        {
          _id: 'client-1',
          name: 'Acme',
          status: 'active',
          billingCurrency: 'USD',
        },
      ]);
      mockAgentsService.findManyByIds.mockResolvedValue([]);
      mockPersonalityRepository.findManyByIds.mockResolvedValue([
        mockPersonality,
      ]);

      const result = await service.findByClient('client-1');

      expect(result[0].agent).toBeNull();
    });
  });

  describe('update', () => {
    it('should return client agent unchanged when no updates provided', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);

      const result = await service.update('ca-1', {} as any);
      expect(mockClientAgentRepository.updateWithQuery).not.toHaveBeenCalled();
      expect(result).toEqual(mockClientAgent);
    });

    it('should update client agent when personalityId is provided', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockPersonalityRepository.findActiveById.mockResolvedValue(
        mockPersonality,
      );
      mockClientAgentRepository.updateWithQuery.mockResolvedValue({
        ...mockClientAgent,
        personalityId: 'personality-1',
      });

      const result = await service.update('ca-1', {
        personalityId: '507f1f77bcf86cd799439099',
      } as any);
      expect(mockPersonalityRepository.findActiveById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439099',
      );
      expect(mockClientAgentRepository.updateWithQuery).toHaveBeenCalledWith(
        'ca-1',
        expect.objectContaining({ $set: expect.any(Object) }),
      );
      expect(result).toEqual({
        ...mockClientAgent,
        personalityId: 'personality-1',
      });
    });

    it('should unset promptSupplement when cleared with whitespace-only string', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.updateWithQuery.mockResolvedValue({
        ...mockClientAgent,
      });

      await service.update('ca-1', { promptSupplement: '   \n  ' } as any);

      expect(mockClientAgentRepository.updateWithQuery).toHaveBeenCalledWith(
        'ca-1',
        { $unset: { promptSupplement: '' } },
      );
    });

    it('should throw NotFoundException if not found', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(null);
      await expect(service.update('unknown', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      await expect(service.update('ca-1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status to inactive', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({
        ...mockClientAgent,
        status: 'inactive',
      });

      const result = await service.updateStatus('ca-1', { status: 'inactive' });

      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', {
        status: 'inactive',
      });
      expect(result.status).toBe('inactive');
    });

    it('should archive without cascading (channels are embedded)', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });

      const result = await service.updateStatus('ca-1', { status: 'archived' });

      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', {
        status: 'archived',
      });
      expect(result.status).toBe('archived');
    });

    it('should throw BadRequestException if already archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        ...mockClientAgent,
        status: 'archived',
      });
      await expect(
        service.updateStatus('ca-1', { status: 'active' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateClientTotal', () => {
    it('should sum prices of active agents and return total with currency', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([
        {
          agentPricing: { amount: 100, currency: 'USD' },
          channels: [{ status: 'active', amount: 10 }],
        },
        {
          agentPricing: { amount: 200, currency: 'USD' },
          channels: [{ status: 'active', amount: 0 }],
        },
      ]);

      const result = await service.calculateClientTotal('client-1');
      expect(mockClientsService.findById).toHaveBeenCalledWith('client-1');
      expect(
        mockClientAgentRepository.findByClientAndStatus,
      ).toHaveBeenCalledWith('client-1', 'active');
      expect(result).toEqual({ total: 310, currency: 'USD' });
    });

    it('should return 0 and client currency if no active agents', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([]);
      const result = await service.calculateClientTotal('client-1');
      expect(result).toEqual({ total: 0, currency: 'USD' });
    });
  });

  describe('findAllHydrated', () => {
    it('computes pagination math (total=37, page=2, limit=10 → totalPages=4, skip=10)', async () => {
      mockClientAgentRepository.countByFilter.mockResolvedValue(37);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([]);

      const result = await service.findAllHydrated({
        page: 2,
        limit: 10,
      } as any);

      expect(
        mockClientAgentRepository.findPageWithProjection,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ skip: 10, limit: 10 }),
      );
      expect(result.totalPages).toBe(4);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(37);
    });

    it('uses default sort { createdAt: -1 } when sort is undefined', async () => {
      mockClientAgentRepository.countByFilter.mockResolvedValue(0);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([]);

      await service.findAllHydrated({} as any);

      expect(
        mockClientAgentRepository.findPageWithProjection,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ sort: { createdAt: -1 } }),
      );
    });

    it('parses descending sort prefix `-updatedAt`', async () => {
      mockClientAgentRepository.countByFilter.mockResolvedValue(0);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([]);

      await service.findAllHydrated({ sort: '-updatedAt' } as any);

      expect(
        mockClientAgentRepository.findPageWithProjection,
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ sort: { updatedAt: -1 } }),
      );
    });

    it('passes filters through to the repo correctly with personalityId as ObjectId', async () => {
      mockClientAgentRepository.countByFilter.mockResolvedValue(0);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([]);

      await service.findAllHydrated({
        status: 'active',
        clientId: 'c-1',
        agentId: 'a-1',
        personalityId: '507f1f77bcf86cd799439099',
        createdAfter: new Date('2024-01-01T00:00:00Z'),
        createdBefore: new Date('2024-12-31T00:00:00Z'),
      } as any);

      const filterArg =
        mockClientAgentRepository.findPageWithProjection.mock.calls[0][0];
      expect(filterArg.status).toBe('active');
      expect(filterArg.clientId).toBe('c-1');
      expect(filterArg.agentId).toBe('a-1');
      expect(filterArg.personalityId).toBeInstanceOf(Types.ObjectId);
      expect(String(filterArg.personalityId)).toBe('507f1f77bcf86cd799439099');
      expect(filterArg.createdAt.$gte).toEqual(
        new Date('2024-01-01T00:00:00Z'),
      );
      expect(filterArg.createdAt.$lt).toEqual(new Date('2024-12-31T00:00:00Z'));

      expect(mockClientAgentRepository.countByFilter).toHaveBeenCalledWith(
        filterArg,
      );
    });

    it('hydrates a page with deduped fan-out calls per relation', async () => {
      const rows = [
        {
          _id: 'ca-1',
          clientId: 'client-A',
          agentId: 'agent-X',
          personalityId: 'pers-1',
          status: 'active',
          agentPricing: {
            amount: 10,
            currency: 'USD',
            monthlyTokenQuota: null,
          },
          billingAnchor: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          channels: [],
        },
        {
          _id: 'ca-2',
          clientId: 'client-A',
          agentId: 'agent-Y',
          personalityId: 'pers-1',
          status: 'active',
          agentPricing: {
            amount: 10,
            currency: 'USD',
            monthlyTokenQuota: null,
          },
          billingAnchor: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          channels: [],
        },
        {
          _id: 'ca-3',
          clientId: 'client-B',
          agentId: 'agent-Y',
          personalityId: 'pers-2',
          status: 'active',
          agentPricing: {
            amount: 10,
            currency: 'USD',
            monthlyTokenQuota: null,
          },
          billingAnchor: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          channels: [],
        },
        {
          _id: 'ca-4',
          clientId: 'client-C',
          agentId: 'agent-Z',
          personalityId: 'pers-2',
          status: 'active',
          agentPricing: {
            amount: 10,
            currency: 'USD',
            monthlyTokenQuota: null,
          },
          billingAnchor: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          channels: [],
        },
        {
          _id: 'ca-5',
          clientId: 'client-A',
          agentId: 'agent-W',
          personalityId: 'pers-1',
          status: 'active',
          agentPricing: {
            amount: 10,
            currency: 'USD',
            monthlyTokenQuota: null,
          },
          billingAnchor: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          channels: [],
        },
      ];
      mockClientAgentRepository.countByFilter.mockResolvedValue(rows.length);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue(rows);
      mockClientsService.findManyByIds.mockResolvedValue([]);
      mockAgentsService.findManyByIds.mockResolvedValue([]);
      mockPersonalityRepository.findManyByIds.mockResolvedValue([]);

      await service.findAllHydrated({} as any);

      expect(mockClientsService.findManyByIds).toHaveBeenCalledTimes(1);
      expect(mockAgentsService.findManyByIds).toHaveBeenCalledTimes(1);
      expect(mockPersonalityRepository.findManyByIds).toHaveBeenCalledTimes(1);

      const clientIdsArg = mockClientsService.findManyByIds.mock.calls[0][0];
      const agentIdsArg = mockAgentsService.findManyByIds.mock.calls[0][0];
      const personalityIdsArg =
        mockPersonalityRepository.findManyByIds.mock.calls[0][0];

      expect(clientIdsArg.sort()).toEqual(
        ['client-A', 'client-B', 'client-C'].sort(),
      );
      expect(agentIdsArg.sort()).toEqual(
        ['agent-W', 'agent-X', 'agent-Y', 'agent-Z'].sort(),
      );
      expect(personalityIdsArg.sort()).toEqual(['pers-1', 'pers-2'].sort());
    });

    it('short-circuits fan-out when the page is empty', async () => {
      mockClientAgentRepository.countByFilter.mockResolvedValue(0);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([]);

      const result = await service.findAllHydrated({} as any);

      expect(mockClientsService.findManyByIds).not.toHaveBeenCalled();
      expect(mockAgentsService.findManyByIds).not.toHaveBeenCalled();
      expect(mockPersonalityRepository.findManyByIds).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(1);
    });

    it('keeps the row in items when a referenced entity is missing (null hydration)', async () => {
      const row = {
        _id: 'ca-1',
        clientId: 'client-missing',
        agentId: 'agent-missing',
        personalityId: 'pers-missing',
        status: 'active',
        agentPricing: { amount: 10, currency: 'USD', monthlyTokenQuota: null },
        billingAnchor: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        channels: [],
      };
      mockClientAgentRepository.countByFilter.mockResolvedValue(1);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([row]);
      mockClientsService.findManyByIds.mockResolvedValue([]);
      mockAgentsService.findManyByIds.mockResolvedValue([]);
      mockPersonalityRepository.findManyByIds.mockResolvedValue([]);

      const result = await service.findAllHydrated({} as any);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].client).toBeNull();
      expect(result.items[0].agent).toBeNull();
      expect(result.items[0].personality).toBeNull();
    });

    it('redacts credentials, telegramWebhookSecretHex, fingerprint, and promptSupplement from output items', async () => {
      const row = {
        _id: 'ca-1',
        clientId: 'client-1',
        agentId: 'agent-1',
        personalityId: 'pers-1',
        status: 'active',
        agentPricing: { amount: 10, currency: 'USD', monthlyTokenQuota: null },
        billingAnchor: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        promptSupplement: 'should-not-leak',
        channels: [
          {
            channelId: 'ch-1',
            provider: 'telegram',
            status: 'active',
            amount: 0,
            currency: 'USD',
            monthlyMessageQuota: null,
            credentials: { botToken: 'super-secret' },
            telegramWebhookSecretHex: 'deadbeef',
            telegramBotId: '123',
            webhookRegistration: {
              status: 'registered',
              attemptCount: 1,
              fingerprint: 'fp-secret',
            },
          },
        ],
      };
      mockClientAgentRepository.countByFilter.mockResolvedValue(1);
      mockClientAgentRepository.findPageWithProjection.mockResolvedValue([row]);
      mockClientsService.findManyByIds.mockResolvedValue([]);
      mockAgentsService.findManyByIds.mockResolvedValue([]);
      mockPersonalityRepository.findManyByIds.mockResolvedValue([]);

      const result = await service.findAllHydrated({} as any);

      const item = result.items[0];

      const json = JSON.stringify(result);
      expect(json).not.toContain('super-secret');
      expect(json).not.toContain('deadbeef');
      expect(json).not.toContain('fp-secret');
      expect(json).not.toContain('should-not-leak');

      // Deep key scan
      const collectKeys = (val: unknown, acc: Set<string>) => {
        if (Array.isArray(val)) {
          for (const v of val) collectKeys(v, acc);
        } else if (val && typeof val === 'object') {
          for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            acc.add(k);
            collectKeys(v, acc);
          }
        }
      };
      const keys = new Set<string>();
      collectKeys(item, keys);
      expect(keys.has('credentials')).toBe(false);
      expect(keys.has('telegramWebhookSecretHex')).toBe(false);
      expect(keys.has('fingerprint')).toBe(false);
      expect(keys.has('promptSupplement')).toBe(false);

      // Sanity: kept fields
      expect(item.channels[0].telegramBotId).toBe('123');
      expect(item.channels[0].webhookRegistration?.status).toBe('registered');
    });
  });

  describe('telegram webhook registration triggers', () => {
    const baseDto: any = {
      clientId: '507f1f77bcf86cd799439011',
      agentId: '507f1f77bcf86cd799439012',
      personalityId: '507f1f77bcf86cd799439099',
      channels: [
        {
          channelId: '507f1f77bcf86cd799439013',
          provider: 'telegram',
          credentials: {
            botToken: '123456789:ABCDEF1234567890abcdef1234567890ABC',
          },
        },
      ],
    };

    function setupCommonMocks() {
      mockClientsService.findById.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockAgentPriceRepository.findActiveByAgentAndCurrency.mockResolvedValue({
        amount: 100,
      });
      mockChannelPriceRepository.findActiveByChannelAndCurrency.mockResolvedValue(
        { amount: 0 },
      );
      mockClientAgentRepository.findByClientAndAgent.mockResolvedValue(null);
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Telegram',
        type: 'telegram',
        supportedProviders: ['telegram'],
        monthlyMessageQuota: null,
      });
    }

    it('enqueues registration after create when telegram channel is active', async () => {
      setupCommonMocks();
      mockClientAgentRepository.create.mockResolvedValue({
        _id: 'ca-tg-1',
        status: 'active',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '123456789',
          },
        ],
      });

      await service.create(baseDto as any);

      expect(mockLifecyclePublisher.publishHappyPath).toHaveBeenCalledWith(
        expect.objectContaining({
          clientAgentId: 'ca-tg-1',
          telegramBotIds: ['123456789'],
        }),
      );
    });

    it('does not enqueue for non-telegram channels on create', async () => {
      setupCommonMocks();
      mockClientAgentRepository.create.mockResolvedValue({
        _id: 'ca-1',
        status: 'active',
        channels: [
          {
            provider: 'instagram',
            status: 'active',
            instagramAccountId: 'i-1',
          },
        ],
      });

      const instagramDto = {
        ...baseDto,
        channels: [
          {
            channelId: '507f1f77bcf86cd799439013',
            provider: 'instagram',
            credentials: { instagramAccountId: '17841400000000009' },
          },
        ],
      };
      mockChannelRepository.findByIdOrFail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439013',
        name: 'Instagram',
        type: 'instagram',
        supportedProviders: ['instagram'],
        monthlyMessageQuota: null,
      });

      await service.create(instagramDto as any);

      expect(mockLifecyclePublisher.publishHappyPath).not.toHaveBeenCalled();
    });

    it('does not roll back create when coordinator throws', async () => {
      setupCommonMocks();
      mockLifecyclePublisher.publishHappyPath.mockRejectedValue(
        new Error('queue down'),
      );
      const created = {
        _id: 'ca-tg-2',
        status: 'active',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '123456789',
          },
        ],
      };
      mockClientAgentRepository.create.mockResolvedValue(created);

      const result = await service.create(baseDto as any);
      expect(result).toBe(created);
    });

    it('enqueues registration after updateStatus transitions inactive to active', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        _id: 'ca-1',
        status: 'inactive',
        clientId: 'client-1',
        agentId: 'agent-1',
      });
      mockClientAgentRepository.update.mockResolvedValue({
        _id: 'ca-1',
        status: 'active',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '987654321',
          },
        ],
      });

      await service.updateStatus('ca-1', { status: 'active' });

      expect(mockLifecyclePublisher.publishHappyPath).toHaveBeenCalledWith(
        expect.objectContaining({
          clientAgentId: 'ca-1',
          telegramBotIds: ['987654321'],
        }),
      );
    });

    it('does not enqueue when updateStatus stays active or transitions to non-active', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({
        _id: 'ca-1',
        status: 'active',
        clientId: 'client-1',
        agentId: 'agent-1',
      });
      mockClientAgentRepository.update.mockResolvedValue({
        _id: 'ca-1',
        status: 'inactive',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '987654321',
          },
        ],
      });

      await service.updateStatus('ca-1', { status: 'inactive' });

      expect(mockLifecyclePublisher.publishHappyPath).not.toHaveBeenCalled();
    });

    it('stamps pending via the lifecycle port BEFORE publishing the happy-path enqueue', async () => {
      setupCommonMocks();
      mockClientAgentRepository.create.mockResolvedValue({
        _id: 'ca-tg-order',
        status: 'active',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '777777777',
          },
        ],
      });

      const order: string[] = [];
      mockLifecyclePort.recordOutcome.mockImplementation(async () => {
        order.push('recordOutcome');
        return { matched: true };
      });
      mockLifecyclePublisher.publishHappyPath.mockImplementation(async () => {
        order.push('publishHappyPath');
      });

      await service.create(baseDto as any);

      expect(mockLifecyclePort.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          telegramBotId: '777777777',
          status: 'pending',
          incrementAttempt: false,
          expectStatus: ['absent', 'pending', 'failed', 'registering'],
        }),
      );
      expect(order[0]).toBe('recordOutcome');
      expect(order[order.length - 1]).toBe('publishHappyPath');
    });

    it('does not abort the publish when the lifecycle port reports matched=false (registered/quarantined no-clobber)', async () => {
      setupCommonMocks();
      mockClientAgentRepository.create.mockResolvedValue({
        _id: 'ca-tg-noop',
        status: 'active',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '888888888',
          },
        ],
      });
      mockLifecyclePort.recordOutcome.mockResolvedValue({ matched: false });

      await service.create(baseDto as any);

      expect(mockLifecyclePublisher.publishHappyPath).toHaveBeenCalledWith(
        expect.objectContaining({ telegramBotIds: ['888888888'] }),
      );
    });

    it('does not abort the publish when the lifecycle port throws on stamping', async () => {
      setupCommonMocks();
      mockClientAgentRepository.create.mockResolvedValue({
        _id: 'ca-tg-err',
        status: 'active',
        channels: [
          {
            provider: 'telegram',
            status: 'active',
            telegramBotId: '999999999',
          },
        ],
      });
      mockLifecyclePort.recordOutcome.mockRejectedValueOnce(
        new Error('mongo-down'),
      );

      const result = await service.create(baseDto as any);
      expect(result).toBeDefined();
      expect(mockLifecyclePublisher.publishHappyPath).toHaveBeenCalled();
    });
  });

  describe('findByClientForClient', () => {
    const rowAlpha = {
      _id: 'ca-1',
      status: 'active' as const,
      agentId: 'agent-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const rowBeta = {
      _id: 'ca-2',
      status: 'archived' as const,
      agentId: 'agent-2',
      createdAt: new Date('2026-02-01T00:00:00Z'),
    };
    const agentAlpha = {
      _id: 'agent-1',
      name: 'Agent Alpha',
      status: 'active',
      kind: 'customer_service',
    };
    const agentBeta = {
      _id: 'agent-2',
      name: 'Agent Beta',
      status: 'inactive',
      kind: 'sales',
    };

    it('returns [] when the repository returns no rows and skips agent hydration', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [],
      );

      const result = await service.findByClientForClient('client-1');

      expect(result).toEqual([]);
      expect(
        mockClientAgentRepository.findProjectedByClientForClientList,
      ).toHaveBeenCalledWith('client-1');
      expect(mockAgentsService.findManyByIds).not.toHaveBeenCalled();
    });

    it('hydrates agents and maps each row to the slim DTO shape', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowAlpha, rowBeta],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([
        agentAlpha,
        agentBeta,
      ]);

      const result = await service.findByClientForClient('client-1');

      expect(result).toEqual([
        {
          id: 'ca-1',
          status: 'active',
          agent: {
            id: 'agent-1',
            name: 'Agent Alpha',
            status: 'active',
            kind: 'customer_service',
          },
        },
        {
          id: 'ca-2',
          status: 'archived',
          agent: {
            id: 'agent-2',
            name: 'Agent Beta',
            status: 'inactive',
            kind: 'sales',
          },
        },
      ]);
    });

    it('top-level DTO key set is exactly { agent, id, status } (whitelist guard)', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowAlpha],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([agentAlpha]);

      const [dto] = await service.findByClientForClient('client-1');

      expect(Object.keys(dto).sort()).toEqual(['agent', 'id', 'status']);
    });

    it('embedded agent key set is exactly { id, kind, name, status } (whitelist guard)', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowAlpha],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([agentAlpha]);

      const [dto] = await service.findByClientForClient('client-1');

      const agent = dto.agent;
      if (agent === null) {
        throw new Error('expected dto.agent to be populated');
      }
      expect(Object.keys(agent).sort()).toEqual([
        'id',
        'kind',
        'name',
        'status',
      ]);
    });

    it('returns agent: null when the referenced agent is missing from hydration', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowAlpha],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([]);

      const result = await service.findByClientForClient('client-1');

      expect(result).toEqual([{ id: 'ca-1', status: 'active', agent: null }]);
    });

    it('preserves repository order (service does not reorder)', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowBeta, rowAlpha],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([
        agentAlpha,
        agentBeta,
      ]);

      const result = await service.findByClientForClient('client-1');

      expect(result.map((d) => d.id)).toEqual(['ca-2', 'ca-1']);
    });

    it('deduplicates agentId values before calling AgentsService.findManyByIds', async () => {
      const rowAlphaDup = { ...rowAlpha, _id: 'ca-1-dup' };
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowAlpha, rowAlphaDup, rowBeta],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([
        agentAlpha,
        agentBeta,
      ]);

      await service.findByClientForClient('client-1');

      const callArg = mockAgentsService.findManyByIds.mock.calls[0][0];
      expect([...callArg].sort()).toEqual(['agent-1', 'agent-2']);
    });

    it('passes the exact clientId through to the repository', async () => {
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [],
      );

      await service.findByClientForClient('tenant-xyz');

      expect(
        mockClientAgentRepository.findProjectedByClientForClientList,
      ).toHaveBeenCalledWith('tenant-xyz');
      expect(
        mockClientAgentRepository.findProjectedByClientForClientList,
      ).toHaveBeenCalledTimes(1);
    });

    it('whitelist mapper drops spurious row fields (regression guard)', async () => {
      const rowWithLeakage = {
        ...rowAlpha,
        clientId: 'tenant-xyz',
        personalityId: 'p-1',
        channels: [{ secret: 'should-not-leak' }],
        agentPricing: { amount: 999 },
      } as any;
      mockClientAgentRepository.findProjectedByClientForClientList.mockResolvedValue(
        [rowWithLeakage],
      );
      mockAgentsService.findManyByIds.mockResolvedValue([agentAlpha]);

      const [dto] = await service.findByClientForClient('client-1');

      expect(Object.keys(dto).sort()).toEqual(['agent', 'id', 'status']);
      expect((dto as any).clientId).toBeUndefined();
      expect((dto as any).personalityId).toBeUndefined();
      expect((dto as any).channels).toBeUndefined();
      expect((dto as any).agentPricing).toBeUndefined();
    });
  });
});
