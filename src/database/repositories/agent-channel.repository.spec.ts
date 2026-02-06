import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AgentChannelRepository } from './agent-channel.repository';
import { AgentChannel } from '../schemas/agent-channel.schema';

describe('AgentChannelRepository', () => {
  let repository: AgentChannelRepository;
  let mockModel: any;

  const mockClientPhoneId = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
  const mockAgentChannel = {
    _id: 'ac-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    channelType: 'whatsapp',
    enabled: true,
    clientPhoneId: mockClientPhoneId,
    channelConfig: {
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
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([mockAgentChannel]),
        }),
        exec: jest.fn().mockResolvedValue([mockAgentChannel]),
      }),
      findOne: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockAgentChannel),
        }),
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

  describe('findByClientPhoneId', () => {
    it('should return agent channel for valid clientPhoneId (global lookup)', async () => {
      const result = await repository.findByClientPhoneId(mockClientPhoneId);

      expect(mockModel.findOne).toHaveBeenCalledWith({
        clientPhoneId: mockClientPhoneId,
      });
      expect(result).toEqual(mockAgentChannel);
    });

    it('should accept string clientPhoneId and convert to ObjectId', async () => {
      const result = await repository.findByClientPhoneId('aaaaaaaaaaaaaaaaaaaaaaaa');

      expect(mockModel.findOne).toHaveBeenCalledWith({
        clientPhoneId: expect.any(Types.ObjectId),
      });
      expect(result).toEqual(mockAgentChannel);
    });

    it('should scope query by clientId when provided', async () => {
      const result = await repository.findByClientPhoneId(mockClientPhoneId, {
        clientId: 'client-1',
      });

      expect(mockModel.findOne).toHaveBeenCalledWith({
        clientPhoneId: mockClientPhoneId,
        clientId: 'client-1',
      });
      expect(result).toEqual(mockAgentChannel);
    });

    it('should return null for unknown clientPhoneId', async () => {
      mockModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const unknownId = new Types.ObjectId();
      const result = await repository.findByClientPhoneId(unknownId);

      expect(result).toBeNull();
    });
  });

  describe('findAllByClientPhoneId', () => {
    it('should return all agent channels for a clientPhoneId', async () => {
      const result = await repository.findAllByClientPhoneId(mockClientPhoneId);

      expect(mockModel.find).toHaveBeenCalledWith({
        clientPhoneId: mockClientPhoneId,
      });
      expect(result).toEqual([mockAgentChannel]);
    });

    it('should scope query by clientId when provided', async () => {
      const result = await repository.findAllByClientPhoneId(mockClientPhoneId, {
        clientId: 'client-1',
      });

      expect(mockModel.find).toHaveBeenCalledWith({
        clientPhoneId: mockClientPhoneId,
        clientId: 'client-1',
      });
    });
  });
});
