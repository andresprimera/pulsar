import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { AgentRepository } from './agent.repository';
import { Agent } from '../schemas/agent.schema';

describe('AgentRepository', () => {
  let repository: AgentRepository;
  let mockModel: any;

  const mockAgent = {
    _id: 'agent-1',
    name: 'Support Bot',
    systemPrompt: 'You are a helpful support assistant.',
    status: 'active',
  };

  beforeEach(async () => {
    mockModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAgent),
      }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockAgent]),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAgent),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRepository,
        {
          provide: getModelToken(Agent.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = module.get<AgentRepository>(AgentRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should return agent when exists', async () => {
      const result = await repository.findById('agent-1');

      expect(mockModel.findById).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual(mockAgent);
    });

    it('should return null when not exists', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all agents', async () => {
      const result = await repository.findAll();

      expect(mockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockAgent]);
    });
  });

  describe('findActiveById', () => {
    it('should return agent when active', async () => {
      const activeAgent = { ...mockAgent, status: 'active' };
      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(activeAgent),
      });

      const result = await repository.findActiveById('agent-1');

      expect(mockModel.findOne).toHaveBeenCalledWith({
        _id: 'agent-1',
        status: 'active',
      });
      expect(result).toEqual(activeAgent);
    });

    it('should return null when agent is inactive', async () => {
      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.findActiveById('agent-1');

      expect(result).toBeNull();
    });
  });

  describe('findAllActive', () => {
    it('should return only active agents', async () => {
      const activeAgents = [{ ...mockAgent, status: 'active' }];
      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(activeAgents),
      });

      const result = await repository.findAllActive();

      expect(mockModel.find).toHaveBeenCalledWith({ status: 'active' });
      expect(result).toEqual(activeAgents);
    });
  });

  describe('validateHireable', () => {
    it('should return agent when active', async () => {
      const activeAgent = { ...mockAgent, status: 'active' };
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(activeAgent),
      });

      const result = await repository.validateHireable('agent-1');

      expect(result).toEqual(activeAgent);
    });

    it('should throw BadRequestException when agent not found', async () => {
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(repository.validateHireable('unknown')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when agent is inactive', async () => {
      const inactiveAgent = { ...mockAgent, status: 'inactive' };
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(inactiveAgent),
      });

      await expect(repository.validateHireable('agent-1')).rejects.toThrow(
        'Agent is not currently available',
      );
    });

    it('should throw BadRequestException when agent is archived', async () => {
      const archivedAgent = { ...mockAgent, status: 'archived' };
      mockModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(archivedAgent),
      });

      await expect(repository.validateHireable('agent-1')).rejects.toThrow(
        'Agent is not currently available',
      );
    });
  });
});
