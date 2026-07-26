import { Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import {
  computeTwilioSignature,
  toSignatureParams,
} from '@channels/whatsapp/utils/twilio-signature.util';
import { TwilioWhatsAppAdapter } from './twilio.adapter';

describe('TwilioWhatsAppAdapter', () => {
  let adapter: TwilioWhatsAppAdapter;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    adapter = new TwilioWhatsAppAdapter(new ChannelEnvService());
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.WHATSAPP_TWILIO_API_BASE_URL;
    delete process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE;
    delete process.env.WHATSAPP_TWILIO_ACCOUNT_SID;
    delete process.env.WHATSAPP_TWILIO_AUTH_TOKEN;
  });

  it('has provider set to ChannelProvider.Twilio', () => {
    expect(adapter.provider).toBe(ChannelProvider.Twilio);
  });

  const createPayload = (overrides: Record<string, unknown> = {}) => ({
    MessageSid: 'SM123',
    From: 'whatsapp:+15551234567',
    To: 'whatsapp:+14155238886',
    Body: 'Hello',
    ...overrides,
  });

  describe('parseInbound', () => {
    it('returns ParsedWhatsAppInbound with normalized phoneNumberId (strip whatsapp: prefix)', () => {
      const result = adapter.parseInbound(createPayload());

      expect(result).toEqual({
        phoneNumberId: '+14155238886',
        senderId: '+15551234567',
        messageId: 'SM123',
        text: 'Hello',
      });
    });

    it('returns undefined for payload missing MessageSid', () => {
      expect(
        adapter.parseInbound(createPayload({ MessageSid: undefined })),
      ).toBeUndefined();
    });

    it('returns undefined for payload missing From or To', () => {
      expect(
        adapter.parseInbound(createPayload({ From: undefined })),
      ).toBeUndefined();
      expect(
        adapter.parseInbound(createPayload({ To: undefined })),
      ).toBeUndefined();
    });

    it('returns undefined for invalid shape (not an object)', () => {
      expect(adapter.parseInbound(null)).toBeUndefined();
      expect(adapter.parseInbound('string')).toBeUndefined();
    });

    it('describes the attachment when a media-only message arrives', () => {
      const result = adapter.parseInbound(
        createPayload({
          Body: '',
          NumMedia: '1',
          MediaUrl0: 'https://example.com/img.png',
          MediaContentType0: 'image/jpeg',
        }),
      );

      expect(result?.text).toBe('[Attachment: image/jpeg]');
      expect(result?.media).toEqual([
        { url: 'https://example.com/img.png', contentType: 'image/jpeg' },
      ]);
    });

    it('describes every attachment when several arrive without text', () => {
      const result = adapter.parseInbound(
        createPayload({
          Body: '',
          NumMedia: '2',
          MediaUrl0: 'https://example.com/img.png',
          MediaContentType0: 'image/jpeg',
          MediaUrl1: 'https://example.com/note.ogg',
          MediaContentType1: 'audio/ogg',
        }),
      );

      expect(result?.text).toBe('[Attachments: image/jpeg, audio/ogg]');
      expect(result?.media).toHaveLength(2);
    });

    it('keeps the caption and the media when both arrive', () => {
      const result = adapter.parseInbound(
        createPayload({
          Body: 'Check this',
          NumMedia: '1',
          MediaUrl0: 'https://example.com/img.png',
          MediaContentType0: 'image/jpeg',
        }),
      );

      expect(result?.text).toBe('Check this');
      expect(result?.media).toEqual([
        { url: 'https://example.com/img.png', contentType: 'image/jpeg' },
      ]);
    });

    it('falls back to a generic label when the content type is absent', () => {
      const result = adapter.parseInbound(
        createPayload({
          Body: '',
          NumMedia: '1',
          MediaUrl0: 'https://example.com/img.png',
        }),
      );

      expect(result?.text).toBe('[Attachment: file]');
    });

    it('ignores a media count that has no matching URL', () => {
      const result = adapter.parseInbound(
        createPayload({ Body: 'Hello', NumMedia: '1' }),
      );

      expect(result?.text).toBe('Hello');
      expect(result?.media).toBeUndefined();
    });

    it('omits media on a plain text message', () => {
      expect(adapter.parseInbound(createPayload())?.media).toBeUndefined();
    });

    it('returns undefined when Body is empty and no media', () => {
      expect(adapter.parseInbound(createPayload({ Body: '' }))).toBeUndefined();
      expect(
        adapter.parseInbound(createPayload({ Body: '   ' })),
      ).toBeUndefined();
    });

    it('normalizes To without whatsapp: prefix (already E.164)', () => {
      const result = adapter.parseInbound(
        createPayload({ To: '+14155238886' }),
      );
      expect(result?.phoneNumberId).toBe('+14155238886');
    });

    it('normalizes phoneNumberId to E.164 when To has no leading + (so routing matches DB)', () => {
      const result = adapter.parseInbound(
        createPayload({ To: 'whatsapp:14155238886' }),
      );
      expect(result?.phoneNumberId).toBe('+14155238886');
    });

    it('normalizes senderId to E.164 (strips whatsapp: prefix from From)', () => {
      const result = adapter.parseInbound(createPayload());
      expect(result?.senderId).toBe('+15551234567');
    });
  });

  describe('sendMessage', () => {
    it('sends via Twilio REST API with Basic auth and form body', async () => {
      await adapter.sendMessage('+15559999999', 'Hi', {
        phoneNumberId: '+14155238886',
        accountSid: 'AC123',
        authToken: 'token',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
      const rawBody = fetchSpy.mock.calls[0][1].body;
      const bodyStr =
        rawBody instanceof URLSearchParams
          ? rawBody.toString()
          : typeof rawBody === 'string'
          ? rawBody
          : '';
      const params = new URLSearchParams(bodyStr);
      expect(params.get('From')).toBe('whatsapp:+14155238886');
      expect(params.get('To')).toBe('whatsapp:+15559999999');
      expect(params.get('Body')).toBe('Hi');
    });

    it('adds whatsapp: prefix when phoneNumberId has no prefix', async () => {
      await adapter.sendMessage('+15559999999', 'Hi', {
        phoneNumberId: '+14155238886',
        accountSid: 'AC123',
        authToken: 'token',
      });

      const rawBody = fetchSpy.mock.calls[0][1].body;
      const bodyStr =
        rawBody instanceof URLSearchParams
          ? rawBody.toString()
          : typeof rawBody === 'string'
          ? rawBody
          : '';
      const params = new URLSearchParams(bodyStr);
      expect(params.get('From')).toBe('whatsapp:+14155238886');
      expect(params.get('To')).toBe('whatsapp:+15559999999');
    });

    it('uses WHATSAPP_TWILIO_API_BASE_URL from env when set', async () => {
      process.env.WHATSAPP_TWILIO_API_BASE_URL =
        'https://api.custom-twilio.example.com/2010-04-01';
      const adapterWithCustomUrl = new TwilioWhatsAppAdapter(
        new ChannelEnvService(),
      );

      await adapterWithCustomUrl.sendMessage('+15559999999', 'Hi', {
        phoneNumberId: '+14155238886',
        accountSid: 'AC123',
        authToken: 'token',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.custom-twilio.example.com/2010-04-01/Accounts/AC123/Messages.json',
        expect.any(Object),
      );
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      } as unknown as Response);

      await expect(
        adapter.sendMessage('+15559999999', 'Hi', {
          phoneNumberId: '+14155238886',
          accountSid: 'AC123',
          authToken: 'bad',
        }),
      ).rejects.toThrow('WhatsApp Twilio API error: 401');
    });
  });

  describe('sendTemplate', () => {
    const credentials = {
      phoneNumberId: '+14155238886',
      accountSid: 'AC123',
      authToken: 'token',
    };

    it('sends an approved template via the Content API', async () => {
      await adapter.sendTemplate(
        '+15559999999',
        { templateId: 'HX123', variables: { '1': 'Ada' } },
        credentials,
      );

      const [url, init] = fetchSpy.mock.calls[0] as any;
      expect(url).toBe(
        'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      );
      const body = new URLSearchParams(init.body.toString());
      expect(body.get('ContentSid')).toBe('HX123');
      expect(body.get('ContentVariables')).toBe('{"1":"Ada"}');
      expect(body.get('From')).toBe('whatsapp:+14155238886');
      expect(body.get('To')).toBe('whatsapp:+15559999999');
      expect(body.get('Body')).toBeNull();
    });

    it('omits ContentVariables when the template takes none', async () => {
      await adapter.sendTemplate(
        '+15559999999',
        { templateId: 'HX123' },
        credentials,
      );

      const [, init] = fetchSpy.mock.calls[0] as any;
      const body = new URLSearchParams(init.body.toString());
      expect(body.get('ContentVariables')).toBeNull();
    });

    it('throws on a non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad template'),
      } as unknown as Response);

      await expect(
        adapter.sendTemplate(
          '+15559999999',
          { templateId: 'HX123' },
          credentials,
        ),
      ).rejects.toThrow('WhatsApp Twilio API error: 400');
    });
  });

  describe('verifyWebhook', () => {
    it('does not implement verifyWebhook', () => {
      expect((adapter as any).verifyWebhook).toBeUndefined();
    });
  });

  describe('verifyInboundSignature', () => {
    const url = 'https://api.example.com/whatsapp/webhook/twilio';
    const payload = {
      MessageSid: 'SM123',
      From: 'whatsapp:+15551234567',
      To: 'whatsapp:+14155238886',
      Body: 'Hello',
    };

    const signPayload = (authToken: string) =>
      computeTwilioSignature(authToken, url, toSignatureParams(payload));

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });

    it('skips validation outside production when not explicitly enabled', () => {
      expect(
        adapter.verifyInboundSignature({ url, payload, signature: undefined }),
      ).toBe(true);
    });

    it('accepts a correctly signed request', () => {
      process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE = 'true';
      process.env.WHATSAPP_TWILIO_ACCOUNT_SID = 'AC123';
      process.env.WHATSAPP_TWILIO_AUTH_TOKEN = 'secret-token';

      expect(
        adapter.verifyInboundSignature({
          url,
          payload,
          signature: signPayload('secret-token'),
        }),
      ).toBe(true);
    });

    it('rejects a signature produced with a different token', () => {
      process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE = 'true';
      process.env.WHATSAPP_TWILIO_ACCOUNT_SID = 'AC123';
      process.env.WHATSAPP_TWILIO_AUTH_TOKEN = 'secret-token';

      expect(
        adapter.verifyInboundSignature({
          url,
          payload,
          signature: signPayload('other-token'),
        }),
      ).toBe(false);
    });

    it('rejects a request whose params were tampered with', () => {
      process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE = 'true';
      process.env.WHATSAPP_TWILIO_ACCOUNT_SID = 'AC123';
      process.env.WHATSAPP_TWILIO_AUTH_TOKEN = 'secret-token';

      expect(
        adapter.verifyInboundSignature({
          url,
          payload: { ...payload, To: 'whatsapp:+19998887777' },
          signature: signPayload('secret-token'),
        }),
      ).toBe(false);
    });

    it('rejects a request with no signature header', () => {
      process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE = 'true';
      process.env.WHATSAPP_TWILIO_ACCOUNT_SID = 'AC123';
      process.env.WHATSAPP_TWILIO_AUTH_TOKEN = 'secret-token';

      expect(
        adapter.verifyInboundSignature({ url, payload, signature: undefined }),
      ).toBe(false);
    });

    it('rejects when validation is enforced but no auth token is configured', () => {
      process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE = 'true';

      expect(
        adapter.verifyInboundSignature({
          url,
          payload,
          signature: signPayload('secret-token'),
        }),
      ).toBe(false);
    });
  });
});
