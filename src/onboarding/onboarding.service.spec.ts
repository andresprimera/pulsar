import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OnboardingService } from './onboarding.service';
import { ClientRepository } from '../database/repositories/client.repository';
import { UserRepository } from '../database/repositories/user.repository';
import { AgentRepository } from '../database/repositories/agent.repository';
import { ChannelRepository } from '../database/repositories/channel.repository';
import { ClientAgentRepository } from '../database/repositories/client-agent.repository';
import { AgentChannelRepository } from '../database/repositories/agent-channel.repository';
import { ClientPhoneRepository } from '../database/repositories/client-phone.repository';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let mockSession: any;
  let mockConnection: any;
  let mockClientRepository: any;
  let mockUserRepository: any;
  let mockAgentRepository: any;
  let mockChannelRepository: any;
  let mockClientAgentRepository: any;
  let mockAgentChannelRepository: any;
  let mockClientPhoneRepository: any;

  const mockClient = {
    _id: 'client-1',
    name: 'Test Client',
    type: 'individual',
    status: 'active',
    toObject: () => ({
      _id: 'client-1',
      name: 'Test Client',
      type: 'individual',
      status: 'active',
    }),
  };

  const mockUser = {
    _id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    clientId: 'client-1',
    status: 'active',
    toObject: () => ({
      _id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      clientId: 'client-1',
      status: 'active',
    }),
  };

  const mockAgent = {
    _id: 'agent-1',
    name: 'Test Agent',
    status: 'active',
  };

  const mockChannel = {
    _id: 'channel-1',
    name: 'whatsapp-main',
    type: 'whatsapp',
    provider: 'meta',
  };

  const mockClientAgent = {
    _id: 'client-agent-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    price: 100,
    status: 'active',
    toObject: () => ({
      _id: 'client-agent-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      price: 100,
      status: 'active',
    }),
  };

  const mockClientPhone = {
    _id: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
    clientId: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
    phoneNumberId: '123',
    provider: 'meta',
  };

  const mockAgentChannel = {
    _id: 'agent-channel-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    channelId: 'channel-1',
    status: 'active',
    clientPhoneId: mockClientPhone._id,
    channelConfig: { accessToken: 'token', webhookVerifyToken: 'verify' },
    llmConfig: { provider: 'openai', apiKey: 'secret-key', model: 'gpt-4' },
    toObject: () => ({
      _id: 'agent-channel-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      channelId: 'channel-1',
      status: 'active',
      clientPhoneId: mockClientPhone._id,
      channelConfig: { accessToken: 'token', webhookVerifyToken: 'verify' },
      llmConfig: { provider: 'openai', apiKey: 'secret-key', model: 'gpt-4' },
    }),
  };

  beforeEach(async () => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    mockClientRepository = {
      create: jest.fn().mockResolvedValue(mockClient),
      update: jest.fn().mockResolvedValue(mockClient),
    };

    mockUserRepository = {
      create: jest.fn().mockResolvedValue(mockUser),
      findByEmail: jest.fn().mockResolvedValue(null),
    };

    mockAgentRepository = {
      validateHireable: jest.fn().mockResolvedValue(mockAgent),
    };

    mockChannelRepository = {
      findOrCreateByName: jest.fn().mockResolvedValue(mockChannel),
    };

    mockClientAgentRepository = {
      create: jest.fn().mockResolvedValue(mockClientAgent),
    };

    mockAgentChannelRepository = {
      create: jest.fn().mockResolvedValue(mockAgentChannel),
      findByClientPhoneId: jest.fn().mockResolvedValue(null),
    };

    mockClientPhoneRepository = {
      findByPhoneNumber: jest.fn().mockResolvedValue(null),
      resolveOrCreate: jest.fn().mockResolvedValue(mockClientPhone),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: ClientRepository, useValue: mockClientRepository },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: AgentRepository, useValue: mockAgentRepository },
        { provide: ChannelRepository, useValue: mockChannelRepository },
        { provide: ClientAgentRepository, useValue: mockClientAgentRepository },
        { provide: AgentChannelRepository, useValue: mockAgentChannelRepository },
        { provide: ClientPhoneRepository, useValue: mockClientPhoneRepository },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerAndHire', () => {
    const validDto = {
      user: { email: 'TEST@example.com', name: 'Test User' },
      client: { type: 'individual' as const },
      agentHiring: { agentId: 'agent-1', price: 100 },
      channels: [
        {
          name: 'whatsapp-main',
          type: 'whatsapp' as const,
          provider: 'meta' as const,
          agentChannelConfig: {
            channelConfig: { phoneNumberId: '123' },
            llmConfig: {
              provider: 'openai' as const,
              apiKey: 'key',
              model: 'gpt-4',
            },
          },
        },
      ],
    };

    it('should complete full registration flow successfully', async () => {
      const result = await service.registerAndHire(validDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('client');
      expect(result).toHaveProperty('clientAgent');
      expect(result).toHaveProperty('agentChannels');

      expect(mockSession.startTransaction).toHaveBeenCalled();
      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should normalize email to lowercase and trim', async () => {
      await service.registerAndHire(validDto);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' }),
        mockSession,
      );
    });

    it('should use user name as client name when client.name is not provided', async () => {
      await service.registerAndHire(validDto);

      expect(mockClientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test User' }),
        mockSession,
      );
    });

    it('should use explicit client name when provided', async () => {
      const dtoWithClientName = {
        ...validDto,
        client: { type: 'individual' as const, name: 'Custom Client Name' },
      };

      await service.registerAndHire(dtoWithClientName);

      expect(mockClientRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Custom Client Name' }),
        mockSession,
      );
    });

    it('should remove apiKey from response', async () => {
      const result = await service.registerAndHire(validDto);

      expect(result.agentChannels[0].llmConfig).not.toHaveProperty('apiKey');
      expect(result.agentChannels[0].llmConfig).toHaveProperty('provider');
      expect(result.agentChannels[0].llmConfig).toHaveProperty('model');
    });

    it('should throw ConflictException if user email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        'User with this email already exists',
      );
    });

    it('should throw BadRequestException when agent is not hireable', async () => {
      mockAgentRepository.validateHireable.mockRejectedValue(
        new BadRequestException('Agent is not currently available'),
      );

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when organization type has no name', async () => {
      const dtoWithOrgNoName = {
        ...validDto,
        client: { type: 'organization' as const },
      };

      await expect(service.registerAndHire(dtoWithOrgNoName)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.registerAndHire(dtoWithOrgNoName)).rejects.toThrow(
        'Client name is required for organization type',
      );
    });

    it('should allow same phone number to be used by multiple channels of the same client', async () => {
      const dtoWithSamePhoneMultipleChannels = {
        ...validDto,
        channels: [
          {
            name: 'channel-1',
            type: 'whatsapp' as const,
            provider: 'meta' as const,
            agentChannelConfig: {
              channelConfig: { phoneNumberId: '123' },
              llmConfig: {
                provider: 'openai' as const,
                apiKey: 'key',
                model: 'gpt-4',
              },
            },
          },
          {
            name: 'channel-2',
            type: 'whatsapp' as const,
            provider: 'meta' as const,
            agentChannelConfig: {
              channelConfig: { phoneNumberId: '123' }, // same phone number - ALLOWED
              llmConfig: {
                provider: 'openai' as const,
                apiKey: 'key',
                model: 'gpt-4',
              },
            },
          },
        ],
      };

      // Should succeed - same phone can be used by multiple channels
      const result = await service.registerAndHire(dtoWithSamePhoneMultipleChannels);

      expect(result.agentChannels).toHaveLength(2);
      // resolveOrCreate called twice but returns same ClientPhone
      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledTimes(2);
    });

    it('should throw ConflictException when phone number is owned by another client', async () => {
      mockClientPhoneRepository.findByPhoneNumber.mockResolvedValue({
        _id: new Types.ObjectId(),
        phoneNumberId: '123',
        clientId: new Types.ObjectId(),
      });

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        'Phone number 123 is already owned by another client',
      );
    });

    it('should resolve or create ClientPhone during registration', async () => {
      await service.registerAndHire(validDto);

      expect(mockClientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
        'client-1', // clientId from mock
        '123',
        expect.objectContaining({
          provider: 'meta',
          session: mockSession,
        }),
      );
    });

    it('should throw BadRequestException for duplicate channel names in request', async () => {
      const dtoWithDuplicateChannels = {
        ...validDto,
        channels: [
          {
            name: 'same-name',
            type: 'whatsapp' as const,
            agentChannelConfig: {
              channelConfig: { phoneNumberId: '123' },
              llmConfig: {
                provider: 'openai' as const,
                apiKey: 'key',
                model: 'gpt-4',
              },
            },
          },
          {
            name: 'same-name',
            type: 'telegram' as const,
            agentChannelConfig: {
              channelConfig: { botToken: 'token' },
              llmConfig: {
                provider: 'anthropic' as const,
                apiKey: 'key',
                model: 'claude-3',
              },
            },
          },
        ],
      };

      await expect(
        service.registerAndHire(dtoWithDuplicateChannels),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.registerAndHire(dtoWithDuplicateChannels),
      ).rejects.toThrow('Duplicate channel names in request');
    });

    it('should abort transaction on error during writes', async () => {
      const duplicateError = {
        code: 11000,
        keyPattern: { email: 1 },
        message: 'duplicate key error collection: db.users index: email_1',
      };
      mockUserRepository.create.mockRejectedValue(duplicateError);

      await expect(service.registerAndHire(validDto)).rejects.toThrow(
        ConflictException,
      );

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should create multiple agent channels when multiple channels provided', async () => {
      const multiChannelDto = {
        ...validDto,
        channels: [
          {
            name: 'whatsapp-main',
            type: 'whatsapp' as const,
            provider: 'meta' as const,
            agentChannelConfig: {
              channelConfig: { phoneNumberId: '123' },
              llmConfig: {
                provider: 'openai' as const,
                apiKey: 'key',
                model: 'gpt-4',
              },
            },
          },
          {
            name: 'telegram-main',
            type: 'telegram' as const,
            agentChannelConfig: {
              channelConfig: { botToken: 'token' },
              llmConfig: {
                provider: 'anthropic' as const,
                apiKey: 'key',
                model: 'claude-3',
              },
            },
          },
        ],
      };

      await service.registerAndHire(multiChannelDto);

      expect(mockChannelRepository.findOrCreateByName).toHaveBeenCalledTimes(2);
      expect(mockAgentChannelRepository.create).toHaveBeenCalledTimes(2);
    });

    it('should update client with ownerUserId after creating user', async () => {
      await service.registerAndHire(validDto);

      expect(mockClientRepository.update).toHaveBeenCalledWith(
        'client-1',
        expect.objectContaining({ ownerUserId: expect.anything() }),
        mockSession,
      );
    });
  });
});
