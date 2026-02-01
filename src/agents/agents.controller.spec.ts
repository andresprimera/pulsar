import { Test, TestingModule } from '@nestjs/testing';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

describe('AgentsController', () => {
  let controller: AgentsController;
  let mockAgentsService: any;

  const mockAgent = {
    _id: 'agent-1',
    name: 'Test Agent',
    systemPrompt: 'You are helpful.',
    status: 'active',
  };

  beforeEach(async () => {
    mockAgentsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findAvailable: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /agents', () => {
    it('should call service.create', async () => {
      const dto = { name: 'New Agent', systemPrompt: 'Be helpful.' };
      mockAgentsService.create.mockResolvedValue({ ...dto, _id: 'new-id' });

      const result = await controller.create(dto);

      expect(mockAgentsService.create).toHaveBeenCalledWith(dto);
      expect(result).toBeDefined();
    });
  });

  describe('GET /agents', () => {
    it('should call service.findAll without status', async () => {
      mockAgentsService.findAll.mockResolvedValue([mockAgent]);

      const result = await controller.findAll();

      expect(mockAgentsService.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockAgent]);
    });

    it('should pass status filter to service.findAll', async () => {
      mockAgentsService.findAll.mockResolvedValue([mockAgent]);

      const result = await controller.findAll('active');

      expect(mockAgentsService.findAll).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockAgent]);
    });
  });

  describe('GET /agents/available', () => {
    it('should call service.findAvailable', async () => {
      mockAgentsService.findAvailable.mockResolvedValue([mockAgent]);

      const result = await controller.findAvailable();

      expect(mockAgentsService.findAvailable).toHaveBeenCalled();
      expect(result).toEqual([mockAgent]);
    });
  });

  describe('GET /agents/:id', () => {
    it('should call service.findOne', async () => {
      mockAgentsService.findOne.mockResolvedValue(mockAgent);

      const result = await controller.findOne('agent-1');

      expect(mockAgentsService.findOne).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual(mockAgent);
    });
  });

  describe('PATCH /agents/:id', () => {
    it('should call service.update', async () => {
      const dto = { name: 'Updated' };
      mockAgentsService.update.mockResolvedValue({ ...mockAgent, ...dto });

      const result = await controller.update('agent-1', dto);

      expect(mockAgentsService.update).toHaveBeenCalledWith('agent-1', dto);
      expect(result.name).toBe('Updated');
    });
  });

  describe('PATCH /agents/:id/status', () => {
    it('should call service.updateStatus', async () => {
      const dto = { status: 'inactive' as const };
      mockAgentsService.updateStatus.mockResolvedValue({
        ...mockAgent,
        status: 'inactive',
      });

      const result = await controller.updateStatus('agent-1', dto);

      expect(mockAgentsService.updateStatus).toHaveBeenCalledWith(
        'agent-1',
        dto,
      );
      expect(result.status).toBe('inactive');
    });
  });
});
