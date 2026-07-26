import { ChannelProvider } from '@domain/channels/channel-provider.enum';

export interface WhatsAppInboundMedia {
  url: string;
  contentType?: string;
}

export interface ParsedWhatsAppInbound {
  phoneNumberId: string;
  senderId: string;
  messageId: string;
  text: string;
  media?: WhatsAppInboundMedia[];
}

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export interface Dialog360Credentials {
  phoneNumberId: string;
  apiKey: string;
}

export interface TwilioCredentials {
  phoneNumberId: string;
  accountSid: string;
  authToken: string;
}

export type WhatsAppProviderCredentials =
  | MetaCredentials
  | Dialog360Credentials
  | TwilioCredentials;

/**
 * A pre-approved WhatsApp template send. Required to open a conversation
 * outside the 24h customer service window, where freeform text is rejected.
 */
export interface WhatsAppTemplateMessage {
  /** Provider-side identifier of the approved template. */
  templateId: string;
  /** Positional substitutions, keyed as the template declares them. */
  variables?: Record<string, string>;
}

/** Request material a provider needs to authenticate an inbound webhook. */
export interface InboundSignatureContext {
  url: string;
  signature?: string;
  payload: unknown;
}

export interface WhatsAppProviderAdapter {
  readonly provider: ChannelProvider;

  parseInbound(payload: unknown): ParsedWhatsAppInbound | undefined;

  /** Providers that sign their webhooks implement this; absent means no signing scheme. */
  verifyInboundSignature?(context: InboundSignatureContext): boolean;

  sendMessage(
    to: string,
    text: string,
    credentials: WhatsAppProviderCredentials,
  ): Promise<void>;

  /** Providers that support approved templates implement this. */
  sendTemplate?(
    to: string,
    template: WhatsAppTemplateMessage,
    credentials: WhatsAppProviderCredentials,
  ): Promise<void>;

  verifyWebhook?(
    mode: string,
    token: string,
    challenge: string,
  ): string | undefined;
}
