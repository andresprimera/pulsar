import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AgentService } from '../../agent/agent.service';
import { AgentChannelRepository } from '../../database/repositories/agent-channel.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let agentService: jest.Mocked<AgentService>;
  let agentChannelRepository: jest.Mocked<AgentChannelRepository>;
  let agentRepository: jest.Mocked<AgentRepository>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: AgentService,
          useValue: { run: jest.fn() },
        },
        {
          provide: AgentChannelRepository,
          useValue: { findByPhoneNumberId: jest.fn() },
        },
        {
          provide: AgentRepository,
          useValue: { findById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    agentService = module.get(AgentService);
    agentChannelRepository = module.get(AgentChannelRepository);
    agentRepository = module.get(AgentRepository);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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

    const mockAgentChannel = {
      id: 'ac-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      channelType: 'whatsapp' as const,
      enabled: true,
      channelConfig: {
        phoneNumberId: 'phone123',
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
      expect(agentChannelRepository.findByPhoneNumberId).not.toHaveBeenCalled();
    });

    it('should return early when payload has no entry', async () => {
      await service.handleIncoming({ entry: [] });
      expect(agentChannelRepository.findByPhoneNumberId).not.toHaveBeenCalled();
    });

    it('should return early when message type is not text', async () => {
      const payload = createPayload({ message: { type: 'image' } });
      await service.handleIncoming(payload);
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should log warning when no agent_channel found for phoneNumberId', async () => {
      agentChannelRepository.findByPhoneNumberId.mockResolvedValue(null);

      const payload = createPayload({ metadata: { phone_number_id: 'unknown-phone' } });
      await service.handleIncoming(payload);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WhatsApp] No agent_channel found for phoneNumberId=unknown-phone',
      );
      expect(agentService.run).not.toHaveBeenCalled();
    });

    it('should call agentService.run with correct input and context', async () => {
      agentChannelRepository.findByPhoneNumberId.mockResolvedValue(mockAgentChannel as any);
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
          channelType: 'whatsapp',
          systemPrompt: 'You are a helpful assistant.',
          llmConfig: mockAgentChannel.llmConfig,
          channelConfig: mockAgentChannel.channelConfig,
        },
      );
    });

    it('should log outbound message when reply exists', async () => {
      agentChannelRepository.findByPhoneNumberId.mockResolvedValue(mockAgentChannel as any);
      agentRepository.findById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({ reply: { type: 'text', text: 'Echo response' } });

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[WhatsApp] Sending to 1234567890: Echo response',
      );
    });

    it('should not log outbound message when reply is undefined', async () => {
      agentChannelRepository.findByPhoneNumberId.mockResolvedValue(mockAgentChannel as any);
      agentRepository.findById.mockResolvedValue(mockAgent as any);
      agentService.run.mockResolvedValue({});

      const payload = createPayload();
      await service.handleIncoming(payload);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[WhatsApp] Sending to'),
      );
    });

    it('should use empty systemPrompt when agent is not found', async () => {
      agentChannelRepository.findByPhoneNumberId.mockResolvedValue(mockAgentChannel as any);
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
