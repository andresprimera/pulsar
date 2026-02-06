import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { WhatsappService } from './whatsapp.service';
import { AgentService } from '../../agent/agent.service';
import { AgentChannelRepository } from '../../database/repositories/agent-channel.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientPhoneRepository } from '../../database/repositories/client-phone.repository';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let agentService: jest.Mocked<AgentService>;
  let agentChannelRepository: jest.Mocked<AgentChannelRepository>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let clientPhoneRepository: jest.Mocked<ClientPhoneRepository>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Mock global fetch to prevent real HTTP calls
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: AgentService,
          useValue: { run: jest.fn() },
        },
        {
          provide: AgentChannelRepository,
          useValue: { findByClientPhoneId: jest.fn() },
        },
        {
          provide: AgentRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: ClientPhoneRepository,
          useValue: { findByPhoneNumber: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    agentService = module.get(AgentService);
    agentChannelRepository = module.get(AgentChannelRepository);
    agentRepository = module.get(AgentRepository);
    clientPhoneRepository = module.get(ClientPhoneRepository);

    // Spy on Logger.prototype since a new Logger() is instantiated in the service
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyWebhook', () => {
    it('should return challenge when mode is subscribe and token is valid', () => {
      const result = service.verifyWebhook('subscribe', 'test-token', 'challenge123');
      expect(result).toBe('challenge123');
    });

    it('should throw ForbiddenException when token is invalid', () => {
      expect(() => service.verifyWebhook('subscribe', 'wrong-token', 'challenge123'))
        .toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when mode is not subscribe', () => {
      expect(() => service.verifyWebhook('unsubscribe', 'test-token', 'challenge123'))
        .toThrow(ForbiddenException);
    });
  });

  describe('handleIncoming', () => {
    const createPayload = (overrides: any = {}) => ({
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '1234567890',
              id: 'msg123',
              type: 'text',
              text: { body: 'Hello' },
              ...overrides.message,
            }],
            metadata: { phone_number_id: 'phone123', ...overrides.metadata },
            ...overrides.value,
          },
          ...overrides.change,
        }],
        ...overrides.entry,
      }],
      ...overrides.root,
    });

    const mockClientPhoneId = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
    const mockClientPhone = {
      _id: mockClientPhoneId,
      clientId: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
      phoneNumberId: 'phone123',
      provider: 'meta',
    };

    const mockAgentChannel = {
      id: 'ac-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      channelType: 'whatsapp' as const,
      enabled: true,
      clientPhoneId: mockClientPhoneId,
      channelConfig: {
        accessToken: 'mock-token',
        webhookVerifyToken: 'test-token',
      },
      llmConfig: {
        provider: 'openai' as const,
        apiKey: 'sk-mock-key',
        model: 'gpt-4',
      },
    };

    const mockAgent = {
      id: 'agent-1',
      name: 'Support Bot',
      systemPrompt: 'You are a helpful assistant.',
    };

    it('should return early when payload has no messages', async () => {
      await service.handleIncoming({});
      expect(clientPhoneRepository.findByPhoneNumber).not.toHaveBeenCalled();
    });

    it('should return early when payload has no entry', async () => {
      await service.handleIncoming({ entry: [] });
      expect(clientPhoneRepository.findByPhoneNumber).not.toHaveBeenCalled();
    });

    it('should return early when message type is not text', async () => {
      const payload = createPayload({ message: { type: 'image' } });
      await service.handleIncoming(payload);
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should log warning when no ClientPhone found for phoneNumberId', async () => {
      clientPhoneRepository.findByPhoneNumber.mockResolvedValue(null);

      const payload = createPayload({ metadata: { phone_number_id: 'unknown-phone' } });
      await service.handleIncoming(payload);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        '[WhatsApp] No ClientPhone found for phoneNumberId=unknown-phone. Phone may not be registered.',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should log warning when no agent_channel found for clientPhoneId', async () => {
      clientPhoneRepository.findByPhoneNumber.mockResolvedValue(mockClientPhone as any);
      agentChannelRepository.findByClientPhoneId.mockResolvedValue(null);

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `[WhatsApp] No active agent_channel found for clientPhoneId=${mockClientPhoneId}. Check if channel exists and is active.`,
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should call agentService.run with correct input and context', async () => {
      clientPhoneRepository.findByPhoneNumber.mockResolvedValue(mockClientPhone as any);
      agentChannelRepository.findByClientPhoneId.mockResolvedValue(mockAgentChannel as any);
      agentRepository.findById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({ reply: { type: 'text', text: 'Hello' } });

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(agentService.run).toHaveBeenCalledWith(
        {
          channel: 'whatsapp',
          externalUserId: '1234567890',
          conversationId: 'phone123:1234567890',
          message: { type: 'text', text: 'Hello' },
          metadata: { messageId: 'msg123', phoneNumberId: 'phone123' },
        },
        {
          agentId: 'agent-1',
          clientId: 'client-1',
          systemPrompt: 'You are a helpful assistant.',
          llmConfig: {
            ...mockAgentChannel.llmConfig,
            apiKey: process.env.OPENAI_API_KEY, // Service overrides apiKey from env
          },
          channelConfig: mockAgentChannel.channelConfig,
        },
      );
    });

    it('should log outbound message when reply exists', async () => {
      clientPhoneRepository.findByPhoneNumber.mockResolvedValue(mockClientPhone as any);
      agentChannelRepository.findByClientPhoneId.mockResolvedValue(mockAgentChannel as any);
      agentRepository.findById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({ reply: { type: 'text', text: 'Echo response' } });

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[WhatsApp] Sending to 1234567890: Echo response',
      );
    });

    it('should not log outbound message when reply is undefined', async () => {
      clientPhoneRepository.findByPhoneNumber.mockResolvedValue(mockClientPhone as any);
      agentChannelRepository.findByClientPhoneId.mockResolvedValue(mockAgentChannel as any);
      agentRepository.findById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(loggerLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[WhatsApp] Sending to'),
      );
    });

    it('should use empty systemPrompt when agent is not found', async () => {
      clientPhoneRepository.findByPhoneNumber.mockResolvedValue(mockClientPhone as any);
      agentChannelRepository.findByClientPhoneId.mockResolvedValue(mockAgentChannel as any);
      agentRepository.findById.mockResolvedValue(null);
      agentService.run.mockResolvedValue({ reply: { type: 'text', text: 'Hello' } });

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(agentService.run).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ systemPrompt: '' }),
      );
    });
  });
});
