import { Test, TestingModule } from '@nestjs/testing';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

describe('ClientsController', () => {
  let controller: ClientsController;
  let mockClientsService: any;

  const mockClient = {
    _id: 'client-1',
    name: 'Test Client',
    status: 'active',
  };

  beforeEach(async () => {
    mockClientsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        {
          provide: ClientsService,
          useValue: mockClientsService,
        },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /clients', () => {
    it('should call service.create', async () => {
      const dto = { name: 'New Client' };
      mockClientsService.create.mockResolvedValue({ ...dto, _id: 'new-id' });

      const result = await controller.create(dto);

      expect(mockClientsService.create).toHaveBeenCalledWith(dto);
      expect(result).toBeDefined();
    });
  });

  describe('GET /clients', () => {
    it('should call service.findAll without status', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);

      const result = await controller.findAll();

      expect(mockClientsService.findAll).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockClient]);
    });

    it('should pass status filter to service.findAll', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);

      const result = await controller.findAll('active');

      expect(mockClientsService.findAll).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockClient]);
    });
  });

  describe('GET /clients/:id', () => {
    it('should call service.findById', async () => {
      mockClientsService.findById.mockResolvedValue(mockClient);

      const result = await controller.findOne('client-1');

      expect(mockClientsService.findById).toHaveBeenCalledWith('client-1');
      expect(result).toEqual(mockClient);
    });
  });

  describe('PATCH /clients/:id', () => {
    it('should call service.update', async () => {
      const dto = { name: 'Updated' };
      mockClientsService.update.mockResolvedValue({ ...mockClient, ...dto });

      const result = await controller.update('client-1', dto);

      expect(mockClientsService.update).toHaveBeenCalledWith('client-1', dto);
      expect(result.name).toBe('Updated');
    });
  });

  describe('PATCH /clients/:id/status', () => {
    it('should call service.updateStatus', async () => {
      const dto = { status: 'inactive' as const };
      mockClientsService.updateStatus.mockResolvedValue({
        ...mockClient,
        status: 'inactive',
      });

      const result = await controller.updateStatus('client-1', dto);

      expect(mockClientsService.updateStatus).toHaveBeenCalledWith(
        'client-1',
        dto,
      );
      expect(result.status).toBe('inactive');
    });
  });
});
