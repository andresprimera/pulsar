import { Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { WhatsAppProviderRouter } from './provider-router';
import { MetaWhatsAppAdapter } from './providers/meta.adapter';
import { Dialog360WhatsAppAdapter } from './providers/dialog360.adapter';
import { TwilioWhatsAppAdapter } from './providers/twilio.adapter';
import { ChannelEnvService } from '@channels/config/channel-env.service';

describe('WhatsAppProviderRouter', () => {
  let router: WhatsAppProviderRouter;
  let metaAdapter: MetaWhatsAppAdapter;
  let dialog360Adapter: Dialog360WhatsAppAdapter;
  let twilioAdapter: TwilioWhatsAppAdapter;

  beforeEach(() => {
    metaAdapter = new MetaWhatsAppAdapter();
    dialog360Adapter = new Dialog360WhatsAppAdapter();
    twilioAdapter = new TwilioWhatsAppAdapter(new ChannelEnvService());
    router = new WhatsAppProviderRouter(
      metaAdapter,
      dialog360Adapter,
      twilioAdapter,
    );
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resolve', () => {
    it('returns Meta adapter for ChannelProvider.Meta', () => {
      expect(router.resolve(ChannelProvider.Meta)).toBe(metaAdapter);
    });

    it('returns 360dialog adapter for ChannelProvider.Dialog360', () => {
      expect(router.resolve(ChannelProvider.Dialog360)).toBe(dialog360Adapter);
    });

    it('returns Twilio adapter for ChannelProvider.Twilio', () => {
      expect(router.resolve(ChannelProvider.Twilio)).toBe(twilioAdapter);
    });

    it('defaults to Meta when provider is undefined', () => {
      expect(router.resolve(undefined)).toBe(metaAdapter);
    });

    it('falls back to Meta for unknown provider and logs warning', () => {
      const result = router.resolve('unknown' as any);

      expect(result).toBe(metaAdapter);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('No adapter registered for provider="unknown"'),
      );
    });
  });

  describe('hasAdapter', () => {
    it('returns true for registered providers', () => {
      expect(router.hasAdapter(ChannelProvider.Meta)).toBe(true);
      expect(router.hasAdapter(ChannelProvider.Dialog360)).toBe(true);
    });

    it('returns true for Twilio', () => {
      expect(router.hasAdapter(ChannelProvider.Twilio)).toBe(true);
      expect(router.hasAdapter('twilio')).toBe(true);
    });

    it('returns false for unregistered providers', () => {
      expect(router.hasAdapter('unknown')).toBe(false);
    });
  });
});
