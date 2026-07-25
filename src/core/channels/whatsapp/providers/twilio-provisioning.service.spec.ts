import { Logger } from '@nestjs/common';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { TwilioNumberProvisioningService } from './twilio-provisioning.service';

describe('TwilioNumberProvisioningService', () => {
  let service: TwilioNumberProvisioningService;
  let fetchSpy: jest.SpyInstance;

  const mockJsonResponse = (payload: unknown) =>
    ({
      ok: true,
      json: jest.fn().mockResolvedValue(payload),
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

  beforeEach(() => {
    process.env.WHATSAPP_TWILIO_ACCOUNT_SID = 'AC123';
    process.env.WHATSAPP_TWILIO_AUTH_TOKEN = 'secret-token';
    process.env.PUBLIC_BASE_URL = 'https://api.example.com';

    service = new TwilioNumberProvisioningService(new ChannelEnvService());
    fetchSpy = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.WHATSAPP_TWILIO_ACCOUNT_SID;
    delete process.env.WHATSAPP_TWILIO_AUTH_TOKEN;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.WHATSAPP_TWILIO_API_BASE_URL;
  });

  describe('getInboundWebhookUrl', () => {
    it('builds the webhook URL from PUBLIC_BASE_URL', () => {
      expect(service.getInboundWebhookUrl()).toBe(
        'https://api.example.com/whatsapp/webhook/twilio',
      );
    });

    it('throws when PUBLIC_BASE_URL is not set', () => {
      delete process.env.PUBLIC_BASE_URL;

      expect(() => service.getInboundWebhookUrl()).toThrow(/PUBLIC_BASE_URL/);
    });
  });

  describe('searchAvailableNumbers', () => {
    it('queries Twilio for local numbers and maps the result', async () => {
      fetchSpy.mockResolvedValue(
        mockJsonResponse({
          available_phone_numbers: [
            {
              phone_number: '+14155238886',
              friendly_name: '(415) 523-8886',
              locality: 'San Francisco',
              region: 'CA',
              iso_country: 'US',
            },
          ],
        }),
      );

      const result = await service.searchAvailableNumbers({
        countryCode: 'us',
        areaCode: '415',
        limit: 5,
      });

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain(
        '/Accounts/AC123/AvailablePhoneNumbers/US/Local.json',
      );
      expect(url).toContain('AreaCode=415');
      expect(url).toContain('PageSize=5');
      expect(init.headers.Authorization).toMatch(/^Basic /);
      expect(result).toEqual([
        {
          phoneNumber: '+14155238886',
          friendlyName: '(415) 523-8886',
          locality: 'San Francisco',
          region: 'CA',
          isoCountry: 'US',
        },
      ]);
    });
  });

  describe('purchaseNumber', () => {
    it('buys the number pointed at this server webhook', async () => {
      fetchSpy.mockResolvedValue(
        mockJsonResponse({
          sid: 'PN123',
          phone_number: '+14155238886',
          friendly_name: 'Acme',
          sms_url: 'https://api.example.com/whatsapp/webhook/twilio',
        }),
      );

      const result = await service.purchaseNumber('14155238886', 'Acme');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/IncomingPhoneNumbers.json',
      );
      expect(init.method).toBe('POST');
      const body = new URLSearchParams(init.body.toString());
      expect(body.get('PhoneNumber')).toBe('+14155238886');
      expect(body.get('SmsUrl')).toBe(
        'https://api.example.com/whatsapp/webhook/twilio',
      );
      expect(body.get('SmsMethod')).toBe('POST');
      expect(body.get('FriendlyName')).toBe('Acme');
      expect(result).toEqual({
        sid: 'PN123',
        phoneNumber: '+14155238886',
        friendlyName: 'Acme',
        inboundWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
      });
    });
  });

  describe('configureInboundWebhook', () => {
    it('repoints an owned number at this server webhook', async () => {
      fetchSpy.mockResolvedValue(
        mockJsonResponse({
          sid: 'PN123',
          phone_number: '+14155238886',
          friendly_name: 'Acme',
          sms_url: 'https://api.example.com/whatsapp/webhook/twilio',
        }),
      );

      await service.configureInboundWebhook('PN123');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/IncomingPhoneNumbers/PN123.json',
      );
      const body = new URLSearchParams(init.body.toString());
      expect(body.get('SmsUrl')).toBe(
        'https://api.example.com/whatsapp/webhook/twilio',
      );
    });
  });

  describe('listOwnedNumbers', () => {
    it('maps the Twilio inventory', async () => {
      fetchSpy.mockResolvedValue(
        mockJsonResponse({
          incoming_phone_numbers: [
            {
              sid: 'PN123',
              phone_number: '+14155238886',
              friendly_name: 'Acme',
              sms_url: 'https://api.example.com/whatsapp/webhook/twilio',
            },
          ],
        }),
      );

      const result = await service.listOwnedNumbers();

      expect(result).toEqual([
        {
          sid: 'PN123',
          phoneNumber: '+14155238886',
          friendlyName: 'Acme',
          inboundWebhookUrl: 'https://api.example.com/whatsapp/webhook/twilio',
        },
      ]);
    });
  });

  it('throws when platform Twilio credentials are missing', async () => {
    delete process.env.WHATSAPP_TWILIO_ACCOUNT_SID;
    delete process.env.WHATSAPP_TWILIO_AUTH_TOKEN;

    await expect(service.listOwnedNumbers()).rejects.toThrow(
      /WHATSAPP_TWILIO_ACCOUNT_SID/,
    );
  });

  it('throws a descriptive error on a non-ok Twilio response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('Unauthorized'),
    } as unknown as Response);

    await expect(service.listOwnedNumbers()).rejects.toThrow(
      'Twilio provisioning API error: 401',
    );
  });
});
