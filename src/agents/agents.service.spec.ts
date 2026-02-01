import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentRepository } from '../database/repositories/agent.repository';

describe('AgentsService', () => {
  let service: AgentsService;
  let mockAgentRepository: any;

  const mockAgent = {
    _id: 'agent-1',
    name: 'Test Agent',
    systemPrompt: 'You are helpful.',
    status: 'active',
  };

  beforeEach(async () => {
    mockAgentRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: AgentRepository,
          useValue: mockAgentRepository,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create agent with status=active', async () => {
      const dto = { name: 'New Agent', systemPrompt: 'Be helpful.' };
      mockAgentRepository.create.mockResolvedValue({
        ...dto,
        status: 'active',
        _id: 'new-id',
      });

      const result = await service.create(dto);

      expect(mockAgentRepository.create).toHaveBeenCalledWith({
        ...dto,
        status: 'active',
      });
      expect(result.status).toBe('active');
    });
  });

  describe('findAll', () => {
    it('should return all agents when no status filter', async () => {
      mockAgentRepository.findAll.mockResolvedValue([mockAgent]);

      const result = await service.findAll();

      expect(mockAgentRepository.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockAgent]);
    });

    it('should filter by status when provided', async () => {
      mockAgentRepository.findByStatus.mockResolvedValue([mockAgent]);

      const result = await service.findAll('active');

      expect(mockAgentRepository.findByStatus).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockAgent]);
    });
  });

  describe('findAvailable', () => {
    it('should return only active agents using findByStatus', async () => {
      mockAgentRepository.findByStatus.mockResolvedValue([mockAgent]);

      const result = await service.findAvailable();

      expect(mockAgentRepository.findByStatus).toHaveBeenCalledWith('active');
      expect(result).toEqual([mockAgent]);
    });
  });

  describe('findOne', () => {
    it('should return agent by ID', async () => {
      mockAgentRepository.findById.mockResolvedValue(mockAgent);

      const result = await service.findOne('agent-1');

      expect(mockAgentRepository.findById).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual(mockAgent);
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockAgentRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update agent fields', async () => {
      mockAgentRepository.findById.mockResolvedValue(mockAgent);
      mockAgentRepository.update.mockResolvedValue({
        ...mockAgent,
        name: 'Updated',
      });

      const result = await service.update('agent-1', { name: 'Updated' });

      expect(mockAgentRepository.update).toHaveBeenCalledWith('agent-1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockAgentRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('unknown', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived agent', async () => {
      const archivedAgent = { ...mockAgent, status: 'archived' };
      mockAgentRepository.findById.mockResolvedValue(archivedAgent);

      await expect(
        service.update('agent-1', { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('agent-1', { name: 'Updated' }),
      ).rejects.toThrow('Archived agents cannot be modified');
    });
  });

  describe('updateStatus', () => {
    it('should update agent status', async () => {
      mockAgentRepository.findById.mockResolvedValue(mockAgent);
      mockAgentRepository.update.mockResolvedValue({
        ...mockAgent,
        status: 'inactive',
      });

      const result = await service.updateStatus('agent-1', {
        status: 'inactive',
      });

      expect(mockAgentRepository.update).toHaveBeenCalledWith('agent-1', {
        status: 'inactive',
      });
      expect(result.status).toBe('inactive');
    });

    it('should throw NotFoundException for invalid ID', async () => {
      mockAgentRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('unknown', { status: 'inactive' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived agent', async () => {
      const archivedAgent = { ...mockAgent, status: 'archived' };
      mockAgentRepository.findById.mockResolvedValue(archivedAgent);

      await expect(
        service.updateStatus('agent-1', { status: 'active' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateStatus('agent-1', { status: 'active' }),
      ).rejects.toThrow('Archived agents cannot be modified');
    });
  });
});
