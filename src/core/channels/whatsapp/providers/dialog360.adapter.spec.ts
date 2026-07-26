import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { Dialog360WhatsAppAdapter } from './dialog360.adapter';

describe('Dialog360WhatsAppAdapter', () => {
  let adapter: Dialog360WhatsAppAdapter;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.DIALOG360_API_HOST = 'http://localhost:3006';
    adapter = new Dialog360WhatsAppAdapter();

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.DIALOG360_API_HOST;
  });

  it('has provider set to ChannelProvider.Dialog360', () => {
    expect(adapter.provider).toBe(ChannelProvider.Dialog360);
  });

  const createPayload = (overrides: any = {}) => ({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '1234567890',
                  id: 'msg456',
                  type: 'text',
                  text: { body: 'Hi from 360dialog' },
                  ...overrides.message,
                },
              ],
              metadata: {
                phone_number_id: 'phone456',
                ...overrides.metadata,
              },
            },
          },
        ],
      },
    ],
  });

  describe('parseInbound', () => {
    it('keeps phone_number_id raw and normalizes the sender to E.164', () => {
      const result = adapter.parseInbound(createPayload());

      expect(result).toEqual({
        phoneNumberId: 'phone456',
        senderId: '+1234567890',
        messageId: 'msg456',
        text: 'Hi from 360dialog',
      });
    });

    it('does not E.164-mangle a digits-only phone_number_id', () => {
      const result = adapter.parseInbound(
        createPayload({ metadata: { phone_number_id: '109384756012345' } }),
      );
      expect(result?.phoneNumberId).toBe('109384756012345');
    });

    it('returns undefined for invalid payload', () => {
      expect(adapter.parseInbound({})).toBeUndefined();
    });
  });

  describe('sendMessage', () => {
    it('sends via 360dialog API with D360-API-KEY header', async () => {
      await adapter.sendMessage('1234567890', 'Hello', {
        phoneNumberId: 'phone456',
        apiKey: 'd360-api-key',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3006/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'D360-API-KEY': 'd360-api-key',
          }),
        }),
      );
    });

    it('does not use Bearer authorization', async () => {
      await adapter.sendMessage('1234567890', 'Hello', {
        phoneNumberId: 'phone456',
        apiKey: 'key',
      });

      const callHeaders = fetchSpy.mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Authorization');
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden'),
      } as unknown as Response);

      await expect(
        adapter.sendMessage('1234567890', 'Hello', {
          phoneNumberId: 'phone456',
          apiKey: 'bad-key',
        }),
      ).rejects.toThrow('WhatsApp 360dialog API error: 403');
    });
  });

  describe('verifyWebhook', () => {
    it('does not implement verifyWebhook', () => {
      expect((adapter as any).verifyWebhook).toBeUndefined();
    });
  });
});
