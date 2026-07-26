import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TwilioNumberProvisioningService } from '@channels/whatsapp/providers/twilio-provisioning.service';
import { ClientAgentRepository } from '@persistence/repositories/client-agent.repository';
import { ClientPhoneRepository } from '@persistence/repositories/client-phone.repository';
import { WhatsappNumbersService } from './whatsapp-numbers.service';

describe('WhatsappNumbersService', () => {
  let service: WhatsappNumbersService;
  let twilioProvisioning: jest.Mocked<TwilioNumberProvisioningService>;
  let clientPhoneRepository: jest.Mocked<ClientPhoneRepository>;
  let clientAgentRepository: jest.Mocked<ClientAgentRepository>;

  const channelId = new Types.ObjectId();
  const clientAgentId = new Types.ObjectId().toString();

  const createClientAgent = (overrides: Record<string, unknown> = {}) => ({
    _id: clientAgentId,
    clientId: 'client-1',
    status: 'active',
    channels: [{ channelId, provider: 'twilio' }],
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappNumbersService,
        {
          provide: TwilioNumberProvisioningService,
          useValue: {
            searchAvailableNumbers: jest.fn(),
            listOwnedNumbers: jest.fn(),
            purchaseNumber: jest.fn(),
            findOwnedNumber: jest
              .fn()
              .mockResolvedValue({ sid: 'PN1', phoneNumber: '+14155238886' }),
            listWhatsAppSenders: jest.fn().mockResolvedValue([]),
            findWhatsAppSender: jest.fn().mockResolvedValue(undefined),
            configureSenderWebhook: jest.fn(),
            getInboundWebhookUrl: jest
              .fn()
              .mockReturnValue(
                'https://api.example.com/whatsapp/webhook/twilio',
              ),
          },
        },
        {
          provide: ClientPhoneRepository,
          useValue: {
            findByPhoneNumbers: jest.fn().mockResolvedValue([]),
            resolveOrCreate: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ClientAgentRepository,
          useValue: {
            findById: jest.fn(),
            setChannelPhoneNumber: jest.fn(),
            findActiveByPhoneNumberId: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(WhatsappNumbersService);
    twilioProvisioning = module.get(TwilioNumberProvisioningService);
    clientPhoneRepository = module.get(ClientPhoneRepository);
    clientAgentRepository = module.get(ClientAgentRepository);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listInventory', () => {
    it('reports webhook state from the WhatsApp sender, not the SMS webhook', async () => {
      twilioProvisioning.listOwnedNumbers.mockResolvedValue([
        {
          sid: 'PN1',
          phoneNumber: '+14155238886',
          friendlyName: 'Assigned',
          smsWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
        },
        {
          sid: 'PN2',
          phoneNumber: '+14155230000',
          friendlyName: 'Spare',
          smsWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
        },
      ]);
      twilioProvisioning.listWhatsAppSenders.mockResolvedValue([
        {
          sid: 'XE1',
          phoneNumber: '+14155238886',
          status: 'ONLINE',
          inboundWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
        },
      ]);
      clientPhoneRepository.findByPhoneNumbers.mockResolvedValue([
        { phoneNumberId: '+14155238886', clientId: 'client-1' } as any,
      ]);

      const result = await service.listInventory();

      expect(result).toEqual([
        expect.objectContaining({
          phoneNumber: '+14155238886',
          assignedClientId: 'client-1',
          whatsAppSenderSid: 'XE1',
          whatsAppSenderStatus: 'ONLINE',
          webhookConfigured: true,
        }),
        // Owned and SMS-configured, but no WhatsApp sender: unreachable.
        expect.objectContaining({
          phoneNumber: '+14155230000',
          assignedClientId: undefined,
          whatsAppSenderSid: undefined,
          webhookConfigured: false,
        }),
      ]);
    });

    it('reports false when the sender points somewhere else', async () => {
      twilioProvisioning.listOwnedNumbers.mockResolvedValue([
        { sid: 'PN1', phoneNumber: '+14155238886', friendlyName: 'Assigned' },
      ]);
      twilioProvisioning.listWhatsAppSenders.mockResolvedValue([
        {
          sid: 'XE1',
          phoneNumber: '+14155238886',
          inboundWebhookUrl: 'https://stale.example.com/old',
        },
      ]);

      const [entry] = await service.listInventory();

      expect(entry.webhookConfigured).toBe(false);
    });
  });

  describe('configureWebhook', () => {
    it('points the registered sender at this server', async () => {
      twilioProvisioning.findWhatsAppSender.mockResolvedValue({
        sid: 'XE1',
        phoneNumber: '+14155238886',
      });
      twilioProvisioning.configureSenderWebhook.mockResolvedValue({
        sid: 'XE1',
        phoneNumber: '+14155238886',
        inboundWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
      });

      await service.configureWebhook('14155238886');

      expect(twilioProvisioning.configureSenderWebhook).toHaveBeenCalledWith(
        'XE1',
      );
    });

    it('rejects a number without a registered sender', async () => {
      twilioProvisioning.findWhatsAppSender.mockResolvedValue(undefined);

      await expect(service.configureWebhook('14155238886')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('provision', () => {
    it('buys the requested number', async () => {
      twilioProvisioning.purchaseNumber.mockResolvedValue({
        sid: 'PN1',
        phoneNumber: '+14155238886',
        friendlyName: 'Acme',
      });

      const result = await service.provision({
        phoneNumber: '+14155238886',
        friendlyName: 'Acme',
      });

      expect(twilioProvisioning.purchaseNumber).toHaveBeenCalledWith(
        '+14155238886',
        'Acme',
      );
      expect(result.phoneNumber).toBe('+14155238886');
    });
  });

  describe('assign', () => {
    const dto = {
      phoneNumber: '14155238886',
      clientAgentId,
      channelId: channelId.toString(),
    };

    it('claims ownership then points the channel at the number', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      clientAgentRepository.setChannelPhoneNumber.mockResolvedValue({
        _id: clientAgentId,
      } as any);

      await service.assign(dto);

      expect(clientPhoneRepository.resolveOrCreate).toHaveBeenCalledWith(
        'client-1',
        '+14155238886',
        { provider: 'twilio' },
      );
      expect(clientAgentRepository.setChannelPhoneNumber).toHaveBeenCalledWith(
        clientAgentId,
        channelId.toString(),
        '+14155238886',
        expect.any(String),
      );
    });

    it('does not touch the hire when another client owns the number', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      clientPhoneRepository.resolveOrCreate.mockRejectedValue(
        new ConflictException('already owned'),
      );

      await expect(service.assign(dto)).rejects.toThrow(ConflictException);
      expect(
        clientAgentRepository.setChannelPhoneNumber,
      ).not.toHaveBeenCalled();
    });

    it('rejects an unknown ClientAgent', async () => {
      clientAgentRepository.findById.mockResolvedValue(null);

      await expect(service.assign(dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects an archived ClientAgent', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent({ status: 'archived' }) as any,
      );

      await expect(service.assign(dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects a channel that is not part of the hire', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent({ channels: [] }) as any,
      );

      await expect(service.assign(dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects a channel that is not on the Twilio provider', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent({
          channels: [{ channelId, provider: 'meta' }],
        }) as any,
      );

      await expect(service.assign(dto)).rejects.toThrow(BadRequestException);
      expect(clientPhoneRepository.resolveOrCreate).not.toHaveBeenCalled();
    });

    it('rejects a number the platform Twilio account does not own', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      twilioProvisioning.findOwnedNumber.mockResolvedValue(undefined);

      await expect(service.assign(dto)).rejects.toThrow(BadRequestException);
      expect(clientPhoneRepository.resolveOrCreate).not.toHaveBeenCalled();
    });

    it('rejects a number already routed to another active hire', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      clientAgentRepository.findActiveByPhoneNumberId.mockResolvedValue([
        { _id: new Types.ObjectId().toString(), channels: [] } as any,
      ]);

      await expect(service.assign(dto)).rejects.toThrow(ConflictException);
      expect(clientPhoneRepository.resolveOrCreate).not.toHaveBeenCalled();
    });

    it('rejects a number already routed to another channel on the same hire', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      clientAgentRepository.findActiveByPhoneNumberId.mockResolvedValue([
        {
          _id: clientAgentId,
          channels: [
            {
              channelId: new Types.ObjectId(),
              phoneNumberId: '+14155238886',
            },
          ],
        } as any,
      ]);

      await expect(service.assign(dto)).rejects.toThrow(ConflictException);
    });

    it('allows re-assigning the same number to the same channel', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      clientAgentRepository.findActiveByPhoneNumberId.mockResolvedValue([
        {
          _id: clientAgentId,
          channels: [{ channelId, phoneNumberId: '+14155238886' }],
        } as any,
      ]);
      clientAgentRepository.setChannelPhoneNumber.mockResolvedValue({
        _id: clientAgentId,
      } as any);

      await expect(service.assign(dto)).resolves.toBeDefined();
    });

    it('still assigns when no WhatsApp sender is registered yet', async () => {
      clientAgentRepository.findById.mockResolvedValue(
        createClientAgent() as any,
      );
      twilioProvisioning.findWhatsAppSender.mockResolvedValue(undefined);
      clientAgentRepository.setChannelPhoneNumber.mockResolvedValue({
        _id: clientAgentId,
      } as any);

      await expect(service.assign(dto)).resolves.toBeDefined();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('no registered WhatsApp sender'),
      );
    });
  });
});
