import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SeederService } from './seeder.service';
import { Agent } from './schemas/agent.schema';
import { UserRepository } from './repositories/user.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { OnboardingService } from '../onboarding/onboarding.service';
import { Logger } from '@nestjs/common';

describe('SeederService', () => {
  let service: SeederService;
  let mockAgentModel: any;
  let mockUserRepository: any;
  let mockOnboardingService: any;
  let mockChannelRepository: any;
  let loggerSpy: jest.SpyInstance;

  const mockAgentId = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

  const mockOnboardingResult = {
    user: {
      _id: 'user-id',
      email: 'john.doe@pulsar.com',
      name: 'John Doe',
      clientId: 'client-id',
      status: 'active',
    },
    client: {
      _id: 'client-id',
      type: 'individual',
      name: 'John Doe',
      ownerUserId: 'user-id',
      status: 'active',
    },
    clientAgent: {
      _id: 'client-agent-id',
      clientId: 'client-id',
      agentId: mockAgentId.toString(),
      price: 100,
      status: 'active',
    },
    agentChannels: [
      {
        _id: 'agent-channel-id',
        clientId: 'client-id',
        agentId: mockAgentId.toString(),
        channelId: 'channel-id',
        status: 'active',
      },
    ],
  };

  beforeEach(async () => {
    mockAgentModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockUserRepository = {
      findByEmail: jest.fn(),
    };

    mockOnboardingService = {
      registerAndHire: jest.fn().mockResolvedValue(mockOnboardingResult),
    };

    mockChannelRepository = {
      findOrCreateByName: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        {
          provide: getModelToken(Agent.name),
          useValue: mockAgentModel,
        },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: ChannelRepository, useValue: mockChannelRepository },
      ],
    }).compile();

    service = module.get<SeederService>(SeederService);
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.SEED_DB;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('should skip seeding in PRODUCTION if SEED_DB is not true', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SEED_DB;

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping seeding'),
      );
      expect(mockOnboardingService.registerAndHire).not.toHaveBeenCalled();
    });

    it('should seed in PRODUCTION if SEED_DB is true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SEED_DB = 'true';

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // No existing agent
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockAgentModel.create.mockResolvedValue({ _id: mockAgentId, name: 'Support Bot' });

      await service.onApplicationBootstrap();

      expect(mockOnboardingService.registerAndHire).toHaveBeenCalled();
    });

    it('should seed in DEVELOPMENT by default', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SEED_DB;

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // No existing agent
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockAgentModel.create.mockResolvedValue({ _id: mockAgentId, name: 'Support Bot' });

      await service.onApplicationBootstrap();

      // Verify agent creation
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Support Bot',
          systemPrompt: 'You are a helpful support assistant.',
          status: 'active',
          createdBySeeder: true,
        }),
      );

      // Verify onboarding was called with correct DTO
      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith({
        user: {
          email: 'john.doe@pulsar.com',
          name: 'John Doe',
        },
        client: {
          type: 'individual',
        },
        agentHiring: {
          agentId: mockAgentId.toString(),
          price: 100,
        },
        channels: [
          {
            name: 'WhatsApp',
            type: 'whatsapp',
            provider: 'meta',
            agentChannelConfig: {
              status: 'active',
              channelConfig: {
                phoneNumberId: '1234567890',
                accessToken: '__REPLACE_ME_ACCESS_TOKEN__',
                webhookVerifyToken: '__REPLACE_ME_VERIFY_TOKEN__',
              },
              llmConfig: {
                provider: 'openai',
                apiKey: '__REPLACE_ME_API_KEY__',
                model: 'gpt-4o',
              },
            },
          },
        ],
      });

      // Verify channel provisioning
      expect(mockChannelRepository.findOrCreateByName).toHaveBeenCalledWith(
        'WhatsApp',
        expect.objectContaining({ type: 'whatsapp' }),
      );
    });

    it('should skip seeding in DEVELOPMENT if SEED_DB is false', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SEED_DB = 'false';

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping seeding'),
      );
      expect(mockOnboardingService.registerAndHire).not.toHaveBeenCalled();
    });

    it('should skip seeding if user already exists (idempotency)', async () => {
      process.env.NODE_ENV = 'development';

      // Existing user found
      mockUserRepository.findByEmail.mockResolvedValue({
        _id: 'existing-user-id',
        email: 'john.doe@pulsar.com',
      });

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('already exists. Skipping seeding'),
      );
      expect(mockOnboardingService.registerAndHire).not.toHaveBeenCalled();
    });

    it('should reuse existing agent if found', async () => {
      process.env.NODE_ENV = 'development';

      // No existing user
      mockUserRepository.findByEmail.mockResolvedValue(null);
      // Existing agent found
      mockAgentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: mockAgentId, name: 'Support Bot' }),
      });

      await service.onApplicationBootstrap();

      // Agent should not be created
      expect(mockAgentModel.create).not.toHaveBeenCalled();
      // Onboarding should still be called with existing agent ID
      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(
        expect.objectContaining({
          agentHiring: expect.objectContaining({
            agentId: mockAgentId.toString(),
          }),
        }),
      );
    });
  });
});
