import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SeederService } from './seeder.service';
import { Agent } from './schemas/agent.schema';
import { ClientRepository } from './repositories/client.repository';
import { AgentRepository } from './repositories/agent.repository';
import { UserRepository } from './repositories/user.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { AgentChannelRepository } from './repositories/agent-channel.repository';
import { Logger } from '@nestjs/common';

describe('SeederService', () => {
  let service: SeederService;
  let mockAgentModel: any;
  let mockClientRepository: any;
  let mockAgentRepository: any;
  let mockUserRepository: any;
  let mockClientAgentRepository: any;
  let mockChannelRepository: any;
  let mockAgentChannelRepository: any;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockAgentModel = {
      findOne: jest.fn(),
    };
    mockClientRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ _id: 'client-id', name: 'Acme Corp' }),
    };
    mockAgentRepository = {
      create: jest.fn().mockResolvedValue({ _id: 'agent-id', name: 'Support Bot' }),
    };
    mockUserRepository = {
      findByEmail: jest.fn(),
      create: jest.fn().mockResolvedValue({ _id: 'user-id' }),
    };
    mockClientAgentRepository = {
      findByClient: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ _id: 'link-id' }),
    };
    mockChannelRepository = {
        findOrCreateByName: jest.fn().mockResolvedValue({ _id: 'channel-id', name: 'WhatsApp' }),
    };
    mockAgentChannelRepository = {
        findOrCreate: jest.fn().mockResolvedValue({ _id: 'agent-channel-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        {
          provide: getModelToken(Agent.name),
          useValue: mockAgentModel,
        },
        { provide: ClientRepository, useValue: mockClientRepository },
        { provide: AgentRepository, useValue: mockAgentRepository },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: ClientAgentRepository, useValue: mockClientAgentRepository },
        { provide: ChannelRepository, useValue: mockChannelRepository },
        { provide: AgentChannelRepository, useValue: mockAgentChannelRepository },
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
      expect(mockClientRepository.create).not.toHaveBeenCalled();
    });

    it('should seed in PRODUCTION if SEED_DB is true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SEED_DB = 'true';

      // Mock finding nothing so it attempts to create
      mockClientRepository.findAll.mockResolvedValue([]);
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await service.onApplicationBootstrap();

      expect(mockClientRepository.create).toHaveBeenCalled();
    });

    it('should seed in DEVELOPMENT by default', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SEED_DB;

       // Mock finding nothing so it attempts to create
      mockClientRepository.findAll.mockResolvedValue([]);
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await service.onApplicationBootstrap();

      expect(mockClientRepository.create).toHaveBeenCalled();
      
      // Verify WhatsApp Channel seeding
      expect(mockChannelRepository.findOrCreateByName).toHaveBeenCalledWith(
        'WhatsApp', 
        expect.objectContaining({
          name: 'WhatsApp',
          type: 'whatsapp'
        })
      );
      
      // Verify AgentChannel linking
      expect(mockAgentChannelRepository.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-id',
          channelId: 'channel-id',
          status: 'active',
          channelConfig: expect.objectContaining({
            phoneNumberId: '1234567890',
            accessToken: '__REPLACE_ME_ACCESS_TOKEN__'
          })
        })
      );
    });

    it('should skip seeding in DEVELOPMENT if SEED_DB is false', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SEED_DB = 'false';

      await service.onApplicationBootstrap();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping seeding'),
      );
      expect(mockClientRepository.create).not.toHaveBeenCalled();
    });
  });
});
