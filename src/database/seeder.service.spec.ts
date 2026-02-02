import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SeederService } from './seeder.service';
import { Agent } from './schemas/agent.schema';
import { ClientRepository } from './repositories/client.repository';
import { AgentRepository } from './repositories/agent.repository';
import { UserRepository } from './repositories/user.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { Logger } from '@nestjs/common';

describe('SeederService', () => {
  let service: SeederService;
  let mockAgentModel: any;
  let mockClientRepository: any;
  let mockAgentRepository: any;
  let mockUserRepository: any;
  let mockClientAgentRepository: any;
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
