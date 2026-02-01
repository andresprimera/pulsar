import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SeederService } from './seeder.service';
import { Agent } from './schemas/agent.schema';

describe('SeederService', () => {
  let service: SeederService;
  let mockAgentModel: any;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Reset environment variable
    delete process.env.DISABLE_AUTO_SEED;

    mockAgentModel = {
      exists: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeederService,
        {
          provide: getModelToken(Agent.name),
          useValue: mockAgentModel,
        },
      ],
    }).compile();

    service = module.get<SeederService>(SeederService);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    delete process.env.DISABLE_AUTO_SEED;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('should skip seeding when DISABLE_AUTO_SEED is true', async () => {
      process.env.DISABLE_AUTO_SEED = 'true';

      await service.onApplicationBootstrap();

      expect(mockAgentModel.exists).not.toHaveBeenCalled();
      expect(mockAgentModel.create).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Seeder] Auto seeding disabled',
      );
    });

    it('should seed agents when collection is empty', async () => {
      mockAgentModel.exists.mockResolvedValue(null);
      mockAgentModel.create.mockResolvedValue({});

      await service.onApplicationBootstrap();

      expect(mockAgentModel.exists).toHaveBeenCalledWith({});
      expect(mockAgentModel.create).toHaveBeenCalledWith({
        name: 'Support Bot',
        systemPrompt: 'You are a helpful support assistant.',
        status: 'active',
        createdBySeeder: true,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Seeder] Agents collection is empty, seeding...',
      );
    });

    it('should skip seeding when agents already exist', async () => {
      mockAgentModel.exists.mockResolvedValue({ _id: 'some-id' });

      await service.onApplicationBootstrap();

      expect(mockAgentModel.exists).toHaveBeenCalledWith({});
      expect(mockAgentModel.create).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Seeder] Agents collection has data, skipping seed',
      );
    });
  });
});
