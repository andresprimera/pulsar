import { Test, TestingModule } from '@nestjs/testing';
import { ClientAgentsController } from './client-agents.controller';
import { ClientAgentsService } from './client-agents.service';

describe('ClientAgentsController', () => {
  let controller: ClientAgentsController;
  let mockClientAgentsService: any;

  const mockClientAgent = {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    status: 'active',
    price: 100,
  };

  beforeEach(async () => {
    mockClientAgentsService = {
      create: jest.fn(),
      findByClient: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      calculateClientTotal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientAgentsController],
      providers: [
        {
          provide: ClientAgentsService,
          useValue: mockClientAgentsService,
        },
      ],
    }).compile();

    controller = module.get<ClientAgentsController>(ClientAgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { clientId: 'client-1', agentId: 'agent-1', price: 100 };
      mockClientAgentsService.create.mockResolvedValue(mockClientAgent);

      const result = await controller.create(dto);

      expect(mockClientAgentsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockClientAgent);
    });
  });

  describe('findByClient', () => {
    it('should call service.findByClient', async () => {
      mockClientAgentsService.findByClient.mockResolvedValue([mockClientAgent]);

      const result = await controller.findByClient('client-1');

      expect(mockClientAgentsService.findByClient).toHaveBeenCalledWith('client-1');
      expect(result).toEqual([mockClientAgent]);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { price: 200 };
      mockClientAgentsService.update.mockResolvedValue({ ...mockClientAgent, price: 200 });

      const result = await controller.update('ca-1', dto);

      expect(mockClientAgentsService.update).toHaveBeenCalledWith('ca-1', dto);
      expect(result.price).toBe(200);
    });
  });

  describe('updateStatus', () => {
    it('should call service.updateStatus', async () => {
      const dto = { status: 'inactive' as const };
      mockClientAgentsService.updateStatus.mockResolvedValue({ ...mockClientAgent, status: 'inactive' });

      const result = await controller.updateStatus('ca-1', dto);

      expect(mockClientAgentsService.updateStatus).toHaveBeenCalledWith('ca-1', dto);
      expect(result.status).toBe('inactive');
    });
  });

  describe('calculateClientTotal', () => {
    it('should call service.calculateClientTotal', async () => {
      mockClientAgentsService.calculateClientTotal.mockResolvedValue(100);

      const result = await controller.calculateClientTotal('client-1');

      expect(mockClientAgentsService.calculateClientTotal).toHaveBeenCalledWith('client-1');
      expect(result).toBe(100);
    });
  });
});
