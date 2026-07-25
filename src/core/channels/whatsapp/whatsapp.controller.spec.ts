import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppProviderRouter } from './provider-router';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: jest.Mocked<WhatsAppChannelService>;
  let channelEnvService: jest.Mocked<ChannelEnvService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        {
          provide: WhatsAppChannelService,
          useValue: {
            verifyMetaWebhook: jest.fn(),
            verifyInboundSignature: jest.fn(),
            handleIncoming: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ChannelEnvService,
          useValue: {
            getPublicBaseUrl: jest.fn().mockReturnValue(undefined),
          },
        },
        {
          provide: WhatsAppProviderRouter,
          useValue: {
            hasAdapter: jest.fn((p: string) =>
              [
                ChannelProvider.Meta,
                ChannelProvider.Dialog360,
                ChannelProvider.Twilio,
              ].includes(p as ChannelProvider),
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    service = module.get(WhatsAppChannelService);
    channelEnvService = module.get(ChannelEnvService);
  });

  const createRequest = (overrides: Record<string, unknown> = {}) =>
    ({
      protocol: 'https',
      originalUrl: '/whatsapp/webhook/twilio',
      get: jest.fn().mockReturnValue('api.example.com'),
      ...overrides,
    } as any);

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verify', () => {
    it('delegates to service.verifyMetaWebhook()', () => {
      service.verifyMetaWebhook.mockReturnValue('challenge123');

      const result = controller.verify(
        'subscribe',
        'test-token',
        'challenge123',
      );

      expect(service.verifyMetaWebhook).toHaveBeenCalledWith(
        'subscribe',
        'test-token',
        'challenge123',
      );
      expect(result).toBe('challenge123');
    });
  });

  describe('handleWebhook', () => {
    it('calls service.handleIncoming with ChannelProvider.Meta and returns ok', async () => {
      const payload = { entry: [] };

      const result = await controller.handleWebhook(payload);

      expect(service.handleIncoming).toHaveBeenCalledWith(
        payload,
        ChannelProvider.Meta,
      );
      expect(result).toBe('ok');
    });
  });

  describe('handleProviderWebhook', () => {
    it('calls service.handleIncoming with the specified provider', async () => {
      const payload = { entry: [] };

      const result = await controller.handleProviderWebhook(
        payload,
        ChannelProvider.Dialog360,
      );

      expect(service.handleIncoming).toHaveBeenCalledWith(
        payload,
        ChannelProvider.Dialog360,
      );
      expect(result).toBe('ok');
    });

    it('calls service.handleIncoming with provider "meta"', async () => {
      const payload = { entry: [] };

      const result = await controller.handleProviderWebhook(
        payload,
        ChannelProvider.Meta,
      );

      expect(service.handleIncoming).toHaveBeenCalledWith(
        payload,
        ChannelProvider.Meta,
      );
      expect(result).toBe('ok');
    });

    it('throws BadRequestException for unsupported provider', async () => {
      await expect(
        controller.handleProviderWebhook({}, 'unsupported'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('signature verification', () => {
    it('verifies the signature before processing the webhook', async () => {
      const payload = { MessageSid: 'SM123' };

      await controller.handleProviderWebhook(
        payload,
        ChannelProvider.Twilio,
        'sig123',
        createRequest(),
      );

      expect(service.verifyInboundSignature).toHaveBeenCalledWith(
        ChannelProvider.Twilio,
        {
          url: 'https://api.example.com/whatsapp/webhook/twilio',
          signature: 'sig123',
          payload,
        },
      );
    });

    it('prefers PUBLIC_BASE_URL over the request host', async () => {
      channelEnvService.getPublicBaseUrl.mockReturnValue(
        'https://public.example.com',
      );

      await controller.handleProviderWebhook(
        {},
        ChannelProvider.Twilio,
        'sig123',
        createRequest({ get: jest.fn().mockReturnValue('internal.local') }),
      );

      expect(service.verifyInboundSignature).toHaveBeenCalledWith(
        ChannelProvider.Twilio,
        expect.objectContaining({
          url: 'https://public.example.com/whatsapp/webhook/twilio',
        }),
      );
    });

    it('does not process the webhook when verification fails', async () => {
      service.verifyInboundSignature.mockImplementation(() => {
        throw new ForbiddenException('Invalid webhook signature');
      });

      await expect(
        controller.handleProviderWebhook(
          {},
          ChannelProvider.Twilio,
          'bad-sig',
          createRequest(),
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(service.handleIncoming).not.toHaveBeenCalled();
    });
  });
});
