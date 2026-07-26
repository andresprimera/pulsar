import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppProviderRouter } from './provider-router';
import { IncomingMessageOrchestrator } from '@orchestrator/incoming-message.orchestrator';
import { CHANNEL_TYPES } from '@domain/channels/channel-type.constants';
import { encrypt } from '@shared/crypto.util';
import { WhatsAppProviderAdapter } from './providers/whatsapp-provider.interface';

describe('WhatsAppChannelService', () => {
  let service: WhatsAppChannelService;
  let orchestrator: jest.Mocked<IncomingMessageOrchestrator>;
  let providerRouter: jest.Mocked<WhatsAppProviderRouter>;
  let channelEnvService: jest.Mocked<ChannelEnvService>;
  let mockAdapter: jest.Mocked<WhatsAppProviderAdapter>;

  beforeEach(async () => {
    mockAdapter = {
      provider: ChannelProvider.Meta,
      parseInbound: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      verifyWebhook: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppChannelService,
        {
          provide: IncomingMessageOrchestrator,
          useValue: { handle: jest.fn() },
        },
        {
          provide: WhatsAppProviderRouter,
          useValue: { resolve: jest.fn().mockReturnValue(mockAdapter) },
        },
        {
          provide: ChannelEnvService,
          useValue: {
            getWhatsAppMetaCredentials: jest.fn().mockReturnValue(undefined),
            getWhatsApp360Credentials: jest.fn().mockReturnValue(undefined),
            getWhatsAppTwilioCredentials: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(WhatsAppChannelService);
    orchestrator = module.get(IncomingMessageOrchestrator);
    providerRouter = module.get(WhatsAppProviderRouter);
    channelEnvService = module.get(ChannelEnvService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createPayload = () => ({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '1234567890',
                  id: 'msg123',
                  type: 'text',
                  text: { body: 'Hello' },
                },
              ],
              metadata: { phone_number_id: 'phone123' },
            },
          },
        ],
      },
    ],
  });

  const encryptedCredentials = {
    phoneNumberId: encrypt('phone123'),
    accessToken: encrypt('wa-token'),
  };

  describe('verifyMetaWebhook', () => {
    it('delegates to Meta adapter verifyWebhook', () => {
      (mockAdapter.verifyWebhook as jest.Mock).mockReturnValue('challenge123');

      const result = service.verifyMetaWebhook(
        'subscribe',
        'test-token',
        'challenge123',
      );

      expect(providerRouter.resolve).toHaveBeenCalledWith(ChannelProvider.Meta);
      expect(result).toBe('challenge123');
    });
  });

  describe('handleIncoming', () => {
    it('resolves provider adapter and parses inbound payload', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });
      orchestrator.handle.mockResolvedValue(undefined);

      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      expect(providerRouter.resolve).toHaveBeenCalledWith(ChannelProvider.Meta);
      expect(mockAdapter.parseInbound).toHaveBeenCalledWith(createPayload());
      expect(orchestrator.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: CHANNEL_TYPES.WHATSAPP,
          routeChannelIdentifier: 'phone123',
          channelIdentifier: '1234567890',
          messageId: 'msg123',
          text: 'Hello',
        }),
      );
    });

    it('returns early when parseInbound returns undefined', async () => {
      mockAdapter.parseInbound.mockReturnValue(undefined);

      await service.handleIncoming({}, ChannelProvider.Meta);

      expect(orchestrator.handle).not.toHaveBeenCalled();
    });

    it('sends outbound message using provider from channelMeta', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });

      const dialog360Adapter: jest.Mocked<WhatsAppProviderAdapter> = {
        provider: ChannelProvider.Dialog360,
        parseInbound: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
      };

      providerRouter.resolve
        .mockReturnValueOnce(mockAdapter)
        .mockReturnValueOnce(dialog360Adapter);

      orchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Echo response' },
        channelMeta: {
          encryptedCredentials,
          provider: ChannelProvider.Dialog360,
          routeChannelIdentifier: 'phone123',
        },
      });

      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      expect(providerRouter.resolve).toHaveBeenCalledWith(
        ChannelProvider.Dialog360,
      );
      expect(dialog360Adapter.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        'Echo response',
        expect.objectContaining({ phoneNumberId: 'phone123' }),
      );
    });

    it('does not send outbound when orchestrator returns no reply', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });
      orchestrator.handle.mockResolvedValue({});

      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      expect(mockAdapter.sendMessage).not.toHaveBeenCalled();
    });

    it('does not throw when outbound send fails', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });
      mockAdapter.sendMessage.mockRejectedValue(new Error('API error'));

      orchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Echo response' },
        channelMeta: {
          encryptedCredentials,
          routeChannelIdentifier: 'phone123',
        },
      });

      await expect(
        service.handleIncoming(createPayload(), ChannelProvider.Meta),
      ).resolves.not.toThrow();
    });

    it('sends outbound with Twilio provider using routeChannelIdentifier and env fallback', async () => {
      const twilioAdapter: jest.Mocked<WhatsAppProviderAdapter> = {
        provider: ChannelProvider.Twilio,
        parseInbound: jest.fn().mockReturnValue({
          phoneNumberId: '+14155238886',
          senderId: '+15551234567',
          messageId: 'msg123',
          text: 'Hello',
        }),
        sendMessage: jest.fn().mockResolvedValue(undefined),
      };
      providerRouter.resolve.mockReturnValue(twilioAdapter);
      channelEnvService.getWhatsAppTwilioCredentials.mockReturnValue({
        accountSid: 'AC123',
        authToken: 'env-token',
      });
      orchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Hi' },
        channelMeta: {
          routeChannelIdentifier: '+14155238886',
          encryptedCredentials: undefined,
          provider: ChannelProvider.Twilio,
        },
      });

      await service.handleIncoming(
        {
          MessageSid: 'msg123',
          From: 'whatsapp:+15551234567',
          To: 'whatsapp:+14155238886',
          Body: 'Hello',
        },
        ChannelProvider.Twilio,
      );

      expect(twilioAdapter.sendMessage).toHaveBeenCalledWith(
        '+15551234567',
        'Hi',
        expect.objectContaining({
          phoneNumberId: '+14155238886',
          accountSid: 'AC123',
          authToken: 'env-token',
        }),
      );
    });

    it('uses env fallback for accessToken when DB credentials missing but routeChannelIdentifier provided', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });
      channelEnvService.getWhatsAppMetaCredentials.mockReturnValue({
        accessToken: 'env-token',
      });
      orchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Hi' },
        channelMeta: {
          routeChannelIdentifier: 'phone123',
          encryptedCredentials: undefined,
        },
      });

      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
        '1234567890',
        'Hi',
        expect.objectContaining({
          phoneNumberId: 'phone123',
          accessToken: 'env-token',
        }),
      );
    });

    it('does not log message content in outbound logs', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg123',
        text: 'Hello',
      });

      orchestrator.handle.mockResolvedValue({
        reply: { type: 'text', text: 'Super secret reply' },
        channelMeta: {
          encryptedCredentials,
          routeChannelIdentifier: 'phone123',
        },
      });

      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      const allLogCalls = (Logger.prototype.log as jest.Mock).mock.calls
        .map((c: any[]) => c.join(' '))
        .join('\n');

      expect(allLogCalls).not.toContain('Super secret reply');
    });
  });

  describe('idempotency', () => {
    it('delegates deduplication to the orchestrator rather than filtering in-memory', async () => {
      mockAdapter.parseInbound.mockReturnValue({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'dedup-msg-1',
        text: 'Hello',
      });
      orchestrator.handle.mockResolvedValue(undefined);

      await service.handleIncoming(createPayload(), ChannelProvider.Meta);
      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      expect(orchestrator.handle).toHaveBeenCalledTimes(2);
    });

    it('processes messages with different messageIds', async () => {
      orchestrator.handle.mockResolvedValue(undefined);

      mockAdapter.parseInbound.mockReturnValueOnce({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg-a',
        text: 'First',
      });
      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      mockAdapter.parseInbound.mockReturnValueOnce({
        phoneNumberId: 'phone123',
        senderId: '1234567890',
        messageId: 'msg-b',
        text: 'Second',
      });
      await service.handleIncoming(createPayload(), ChannelProvider.Meta);

      expect(orchestrator.handle).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendTemplate', () => {
    it('sends the template through the provider using env credential fallback', async () => {
      const twilioAdapter: jest.Mocked<WhatsAppProviderAdapter> = {
        provider: ChannelProvider.Twilio,
        parseInbound: jest.fn(),
        sendMessage: jest.fn(),
        sendTemplate: jest.fn().mockResolvedValue(undefined),
      };
      providerRouter.resolve.mockReturnValue(twilioAdapter);
      channelEnvService.getWhatsAppTwilioCredentials.mockReturnValue({
        accountSid: 'AC123',
        authToken: 'env-token',
      });

      await service.sendTemplate({
        to: '+15551234567',
        template: { templateId: 'HX123', variables: { '1': 'Ada' } },
        provider: ChannelProvider.Twilio,
        credentials: undefined,
        routeChannelIdentifier: '+14155238886',
      });

      expect(twilioAdapter.sendTemplate).toHaveBeenCalledWith(
        '+15551234567',
        { templateId: 'HX123', variables: { '1': 'Ada' } },
        expect.objectContaining({
          phoneNumberId: '+14155238886',
          accountSid: 'AC123',
          authToken: 'env-token',
        }),
      );
    });

    it('throws when the provider has no template support', async () => {
      providerRouter.resolve.mockReturnValue(mockAdapter);

      await expect(
        service.sendTemplate({
          to: '+15551234567',
          template: { templateId: 'HX123' },
          provider: ChannelProvider.Meta,
          credentials: encryptedCredentials,
        }),
      ).rejects.toThrow(/does not support template messages/);
    });
  });

  describe('sendMessage (gateway path)', () => {
    it('sends a platform-owned Twilio number using env auth', async () => {
      const twilioAdapter: jest.Mocked<WhatsAppProviderAdapter> = {
        provider: ChannelProvider.Twilio,
        parseInbound: jest.fn(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
      };
      providerRouter.resolve.mockReturnValue(twilioAdapter);
      channelEnvService.getWhatsAppTwilioCredentials.mockReturnValue({
        accountSid: 'AC123',
        authToken: 'env-token',
      });

      // A hire assigned a platform-owned number stores only the number.
      await service.sendMessage({
        to: '+15551234567',
        message: 'Hi',
        provider: ChannelProvider.Twilio,
        credentials: { phoneNumberId: encrypt('+14155238886') },
      });

      expect(twilioAdapter.sendMessage).toHaveBeenCalledWith(
        '+15551234567',
        'Hi',
        {
          phoneNumberId: '+14155238886',
          accountSid: 'AC123',
          authToken: 'env-token',
        },
      );
    });

    it('keeps a Cloud API phone_number_id verbatim', async () => {
      channelEnvService.getWhatsAppMetaCredentials.mockReturnValue({
        accessToken: 'env-token',
      });

      await service.sendMessage({
        to: '+15551234567',
        message: 'Hi',
        provider: ChannelProvider.Meta,
        credentials: { phoneNumberId: encrypt('109384756012345') },
      });

      // A `+` prefix here would corrupt the Graph resource path.
      expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
        '+15551234567',
        'Hi',
        { phoneNumberId: '109384756012345', accessToken: 'env-token' },
      );
    });

    it('throws when no routing identifier can be resolved', async () => {
      await expect(
        service.sendMessage({
          to: '+15551234567',
          message: 'Hi',
          provider: ChannelProvider.Meta,
          credentials: { accessToken: encrypt('wa-token') },
        }),
      ).rejects.toThrow(/No routing identifier/);
    });
  });

  describe('verifyInboundSignature', () => {
    const context = {
      url: 'https://api.example.com/whatsapp/webhook/twilio',
      signature: 'sig123',
      payload: { MessageSid: 'SM123' },
    };

    it('passes through for providers without a signing scheme', () => {
      expect(() =>
        service.verifyInboundSignature(ChannelProvider.Meta, context),
      ).not.toThrow();
    });

    it('throws ForbiddenException when the provider rejects the signature', () => {
      const twilioAdapter: jest.Mocked<WhatsAppProviderAdapter> = {
        provider: ChannelProvider.Twilio,
        parseInbound: jest.fn(),
        sendMessage: jest.fn(),
        verifyInboundSignature: jest.fn().mockReturnValue(false),
      };
      providerRouter.resolve.mockReturnValue(twilioAdapter);

      expect(() =>
        service.verifyInboundSignature(ChannelProvider.Twilio, context),
      ).toThrow(ForbiddenException);
    });

    it('accepts when the provider validates the signature', () => {
      const twilioAdapter: jest.Mocked<WhatsAppProviderAdapter> = {
        provider: ChannelProvider.Twilio,
        parseInbound: jest.fn(),
        sendMessage: jest.fn(),
        verifyInboundSignature: jest.fn().mockReturnValue(true),
      };
      providerRouter.resolve.mockReturnValue(twilioAdapter);

      expect(() =>
        service.verifyInboundSignature(ChannelProvider.Twilio, context),
      ).not.toThrow();
      expect(twilioAdapter.verifyInboundSignature).toHaveBeenCalledWith(
        context,
      );
    });
  });
});
