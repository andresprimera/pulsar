import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AgentChannelRepository } from './agent-channel.repository';
import { AgentChannel } from '../schemas/agent-channel.schema';

describe('AgentChannelRepository', () => {
  let repository: AgentChannelRepository;
  let mockModel: any;

  const mockAgentChannel = {
    _id: 'ac-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    channelType: 'whatsapp',
    enabled: true,
    channelConfig: {
      phoneNumberId: 'phone123',
      accessToken: 'mock-token',
      webhookVerifyToken: 'test-token',
    },
    llmConfig: {
      provider: 'openai',
      apiKey: 'sk-mock-key',
      model: 'gpt-4o-mini',
    },
  };

  beforeEach(async () => {
    mockModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAgentChannel),
      }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockAgentChannel]),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAgentChannel),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentChannelRepository,
        {
          provide: getModelToken(AgentChannel.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    repository = module.get<AgentChannelRepository>(AgentChannelRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should return agent channel when exists', async () => {
      const result = await repository.findById('ac-1');

      expect(mockModel.findById).toHaveBeenCalledWith('ac-1');
      expect(result).toEqual(mockAgentChannel);
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
    it('should return all agent channels', async () => {
      const result = await repository.findAll();

      expect(mockModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockAgentChannel]);
    });
  });

  describe('findByPhoneNumberId', () => {
    it('should return enabled whatsapp channel for valid phoneNumberId', async () => {
      const result = await repository.findByPhoneNumberId('phone123');

      expect(mockModel.findOne).toHaveBeenCalledWith({
        'channelConfig.phoneNumberId': 'phone123',
        status: 'active',
      });
      expect(result).toEqual(mockAgentChannel);
    });

    it('should return null for unknown phoneNumberId', async () => {
      mockModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await repository.findByPhoneNumberId('unknown-phone');

      expect(result).toBeNull();
    });
  });
});
