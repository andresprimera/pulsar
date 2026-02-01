import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { ClientsService } from '../clients/clients.service';
import { AgentsService } from '../agents/agents.service';

describe('ClientAgentsService', () => {
  let service: ClientAgentsService;
  let mockClientAgentRepository: any;
  let mockClientsService: any;
  let mockAgentsService: any;

  const mockClientAgent = {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    status: 'active',
    price: 100,
  };

  const mockClient = {
    id: 'client-1',
    status: 'active',
  };

  const mockAgent = {
    id: 'agent-1',
    status: 'active',
  };

  beforeEach(async () => {
    mockClientAgentRepository = {
      create: jest.fn(),
      findByClient: jest.fn(),
      findByClientAndStatus: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };

    mockClientsService = {
      findOne: jest.fn(),
    };

    mockAgentsService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAgentsService,
        {
          provide: ClientAgentRepository,
          useValue: mockClientAgentRepository,
        },
        {
          provide: ClientsService,
          useValue: mockClientsService,
        },
        {
          provide: AgentsService,
          useValue: mockAgentsService,
        },
      ],
    }).compile();

    service = module.get<ClientAgentsService>(ClientAgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create client agent if client and agent are active', async () => {
      mockClientsService.findOne.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(mockAgent);
      mockClientAgentRepository.create.mockResolvedValue(mockClientAgent);

      const dto = { clientId: 'client-1', agentId: 'agent-1', price: 100 };
      const result = await service.create(dto);

      expect(mockClientsService.findOne).toHaveBeenCalledWith('client-1');
      expect(mockAgentsService.findOne).toHaveBeenCalledWith('agent-1');
      expect(mockClientAgentRepository.create).toHaveBeenCalledWith({
        ...dto,
        status: 'active',
      });
      expect(result).toEqual(mockClientAgent);
    });

    it('should throw BadRequestException if client is not found', async () => {
      mockClientsService.findOne.mockResolvedValue(null);
      
      const dto = { clientId: 'unknown', agentId: 'agent-1', price: 100 };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if client is archived', async () => {
      mockClientsService.findOne.mockResolvedValue({ ...mockClient, status: 'archived' });
      
      const dto = { clientId: 'client-1', agentId: 'agent-1', price: 100 };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if agent is not found', async () => {
      mockClientsService.findOne.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue(null);
      
      const dto = { clientId: 'client-1', agentId: 'unknown', price: 100 };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

     it('should throw BadRequestException if agent is archived', async () => {
      mockClientsService.findOne.mockResolvedValue(mockClient);
      mockAgentsService.findOne.mockResolvedValue({ ...mockAgent, status: 'archived' });
      
      const dto = { clientId: 'client-1', agentId: 'agent-1', price: 100 };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findByClient', () => {
    it('should return client agents', async () => {
      mockClientAgentRepository.findByClient.mockResolvedValue([mockClientAgent]);
      
      const result = await service.findByClient('client-1');
      expect(mockClientAgentRepository.findByClient).toHaveBeenCalledWith('client-1');
      expect(result).toEqual([mockClientAgent]);
    });
  });

  describe('update', () => {
    it('should update client agent', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({ ...mockClientAgent, price: 200 });

      const result = await service.update('ca-1', { price: 200 });
      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', { price: 200 });
      expect(result.price).toBe(200);
    });

    it('should throw NotFoundException if not found', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(null);
      await expect(service.update('unknown', { price: 200 })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({ ...mockClientAgent, status: 'archived' });
      await expect(service.update('ca-1', { price: 200 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('should update status', async () => {
      mockClientAgentRepository.findById.mockResolvedValue(mockClientAgent);
      mockClientAgentRepository.update.mockResolvedValue({ ...mockClientAgent, status: 'inactive' });

      const result = await service.updateStatus('ca-1', { status: 'inactive' });
      expect(mockClientAgentRepository.update).toHaveBeenCalledWith('ca-1', { status: 'inactive' });
      expect(result.status).toBe('inactive');
    });

    it('should throw BadRequestException if already archived', async () => {
      mockClientAgentRepository.findById.mockResolvedValue({ ...mockClientAgent, status: 'archived' });
      await expect(service.updateStatus('ca-1', { status: 'active' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('calculateClientTotal', () => {
    it('should sum prices of active agents', async () => {
      mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([
        { price: 100 },
        { price: 200 },
      ]);

      const result = await service.calculateClientTotal('client-1');
      expect(mockClientAgentRepository.findByClientAndStatus).toHaveBeenCalledWith('client-1', 'active');
      expect(result).toBe(300);
    });

    it('should return 0 if no active agents', async () => {
        mockClientAgentRepository.findByClientAndStatus.mockResolvedValue([]);
        const result = await service.calculateClientTotal('client-1');
        expect(result).toBe(0);
    });
  });
});
