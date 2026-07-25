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
          },
        },
      ],
    }).compile();

    service = module.get(WhatsappNumbersService);
    twilioProvisioning = module.get(TwilioNumberProvisioningService);
    clientPhoneRepository = module.get(ClientPhoneRepository);
    clientAgentRepository = module.get(ClientAgentRepository);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listInventory', () => {
    it('annotates owned numbers with assignment and webhook state', async () => {
      twilioProvisioning.listOwnedNumbers.mockResolvedValue([
        {
          sid: 'PN1',
          phoneNumber: '+14155238886',
          friendlyName: 'Assigned',
          inboundWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
        },
        {
          sid: 'PN2',
          phoneNumber: '+14155230000',
          friendlyName: 'Spare',
          inboundWebhookUrl: 'https://stale.example.com/old',
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
          webhookConfigured: true,
        }),
        expect.objectContaining({
          phoneNumber: '+14155230000',
          assignedClientId: undefined,
          webhookConfigured: false,
        }),
      ]);
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
  });
});
