import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientRepository } from '../database/repositories/client.repository';

describe('ClientsService', () => {
  let service: ClientsService;
  let mockClientRepository: any;

  const mockClient = {
    _id: 'client-1',
    name: 'Test Client',
    description: 'A test client',
    status: 'active',
  };

  beforeEach(async () => {
    mockClientRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: ClientRepository,
          useValue: mockClientRepository,
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create client with status=active', async () => {
      const dto = { name: 'New Client', description: 'New description' };
      mockClientRepository.create.mockResolvedValue({
        ...dto,
        status: 'active',
        _id: 'new-id',
      });

      const result = await service.create(dto);

      expect(mockClientRepository.create).toHaveBeenCalledWith({
        ...dto,
        status: 'active',
      });
      expect(result.status).toBe('active');
    });
  });

  describe('findAll', () => {
    it('should return all clients when no status filter', async () => {
      mockClientRepository.findAll.mockResolvedValue([mockClient]);

      const result = await service.findAll();

      expect(mockClientRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockClient]);
    });

    it('should filter by status when provided', async () => {
      mockClientRepository.findByStatus.mockResolvedValue([mockClient]);

      const result = await service.findAll('active');

      expect(mockClientRepository.findByStatus).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockClient]);
    });
  });

  describe('findById', () => {
    it('should return client by ID', async () => {
      mockClientRepository.findById.mockResolvedValue(mockClient);

      const result = await service.findById('client-1');

      expect(mockClientRepository.findById).toHaveBeenCalledWith('client-1');
      expect(result).toEqual(mockClient);
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockClientRepository.findById.mockResolvedValue(null);

      await expect(service.findById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update client fields', async () => {
      mockClientRepository.findById.mockResolvedValue(mockClient);
      mockClientRepository.update.mockResolvedValue({
        ...mockClient,
        name: 'Updated',
      });

      const result = await service.update('client-1', { name: 'Updated' });

      expect(mockClientRepository.update).toHaveBeenCalledWith('client-1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockClientRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('unknown', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived client', async () => {
      const archivedClient = { ...mockClient, status: 'archived' };
      mockClientRepository.findById.mockResolvedValue(archivedClient);

      await expect(
        service.update('client-1', { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('client-1', { name: 'Updated' }),
      ).rejects.toThrow('Archived clients cannot be modified');
    });
  });

  describe('updateStatus', () => {
    it('should update client status', async () => {
      mockClientRepository.findById.mockResolvedValue(mockClient);
      mockClientRepository.update.mockResolvedValue({
        ...mockClient,
        status: 'inactive',
      });

      const result = await service.updateStatus('client-1', {
        status: 'inactive',
      });

      expect(mockClientRepository.update).toHaveBeenCalledWith('client-1', {
        status: 'inactive',
      });
      expect(result.status).toBe('inactive');
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockClientRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('unknown', { status: 'inactive' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived client', async () => {
      const archivedClient = { ...mockClient, status: 'archived' };
      mockClientRepository.findById.mockResolvedValue(archivedClient);

      await expect(
        service.updateStatus('client-1', { status: 'active' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateStatus('client-1', { status: 'active' }),
      ).rejects.toThrow('Archived clients cannot be modified');
    });
  });
});
