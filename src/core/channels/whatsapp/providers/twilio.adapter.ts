import { Injectable, Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import {
  WhatsAppProviderAdapter,
  ParsedWhatsAppInbound,
  TwilioCredentials,
  InboundSignatureContext,
  WhatsAppTemplateMessage,
  WhatsAppInboundMedia,
} from './whatsapp-provider.interface';
import {
  ensureWhatsAppPrefix,
  normalizeToE164,
  stripWhatsAppPrefix,
} from '@channels/whatsapp/utils/whatsapp-address.util';
import {
  isValidTwilioSignature,
  toSignatureParams,
} from '@channels/whatsapp/utils/twilio-signature.util';
import { ChannelEnvService } from '@channels/config/channel-env.service';

interface TwilioConfig {
  apiBaseUrl: string;
}

interface TwilioWebhookPayload {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  [key: string]: unknown;
}

function isTwilioPayload(payload: unknown): payload is TwilioWebhookPayload {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    'MessageSid' in payload &&
    'From' in payload &&
    'To' in payload
  );
}

/** Twilio delivers attachments as flat MediaUrl0..N / MediaContentType0..N pairs. */
function extractMedia(payload: TwilioWebhookPayload): WhatsAppInboundMedia[] {
  const count = Number(payload.NumMedia ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  const media: WhatsAppInboundMedia[] = [];
  for (let index = 0; index < count; index++) {
    const url = payload[`MediaUrl${index}`];
    if (typeof url !== 'string' || !url.trim()) {
      continue;
    }
    const contentType = payload[`MediaContentType${index}`];
    media.push({
      url: url.trim(),
      contentType: typeof contentType === 'string' ? contentType : undefined,
    });
  }
  return media;
}

/**
 * The agent pipeline is text-only, so an attachment-only message needs a textual
 * stand-in. Without one the message would be dropped and the sender ignored.
 */
function describeMedia(media: WhatsAppInboundMedia[]): string {
  const types = media.map((item) => item.contentType ?? 'file');
  return types.length === 1
    ? `[Attachment: ${types[0]}]`
    : `[Attachments: ${types.join(', ')}]`;
}

@Injectable()
export class TwilioWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = ChannelProvider.Twilio;
  private readonly logger = new Logger(TwilioWhatsAppAdapter.name);
  private readonly config: TwilioConfig;

  constructor(private readonly channelEnvService: ChannelEnvService) {
    this.config = {
      apiBaseUrl:
        process.env.WHATSAPP_TWILIO_API_BASE_URL ||
        'https://api.twilio.com/2010-04-01',
    };
  }

  /**
   * Validates X-Twilio-Signature against the platform Twilio auth token.
   * Routing is driven by the inbound `To` number, so an unsigned request could
   * otherwise select any tenant.
   */
  verifyInboundSignature(context: InboundSignatureContext): boolean {
    if (!this.isSignatureValidationEnforced()) {
      return true;
    }

    const authToken =
      this.channelEnvService.getWhatsAppTwilioCredentials()?.authToken;
    if (!authToken) {
      this.logger.error(
        'Cannot validate Twilio webhook signature: WHATSAPP_TWILIO_AUTH_TOKEN is not set.',
      );
      return false;
    }

    return isValidTwilioSignature(
      authToken,
      context.url,
      toSignatureParams(context.payload),
      context.signature,
    );
  }

  private isSignatureValidationEnforced(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return true;
    }
    return process.env.WHATSAPP_TWILIO_VALIDATE_SIGNATURE?.trim() === 'true';
  }

  parseInbound(payload: unknown): ParsedWhatsAppInbound | undefined {
    if (!isTwilioPayload(payload)) {
      return undefined;
    }

    const messageSid = payload.MessageSid;
    const from = payload.From;
    const to = payload.To;
    const body = payload.Body;

    if (!messageSid || !from || !to) {
      return undefined;
    }

    const bodyEmpty =
      body === undefined || body === null || String(body).trim() === '';
    const media = extractMedia(payload);

    // Nothing to act on: neither text nor an attachment.
    if (bodyEmpty && media.length === 0) {
      return undefined;
    }

    const phoneNumberId = normalizeToE164(stripWhatsAppPrefix(to));
    const text = bodyEmpty ? describeMedia(media) : String(body).trim();

    return {
      phoneNumberId,
      senderId: normalizeToE164(stripWhatsAppPrefix(from)),
      messageId: messageSid,
      text,
      ...(media.length > 0 ? { media } : {}),
    };
  }

  async sendMessage(
    to: string,
    text: string,
    credentials: TwilioCredentials,
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('Body', text);

    await this.postMessage(to, params, credentials);
  }

  /**
   * Sends an approved template through Twilio's Content API, which is the only
   * way to initiate a conversation outside the 24h session window.
   */
  async sendTemplate(
    to: string,
    template: WhatsAppTemplateMessage,
    credentials: TwilioCredentials,
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('ContentSid', template.templateId);
    if (template.variables && Object.keys(template.variables).length > 0) {
      params.append('ContentVariables', JSON.stringify(template.variables));
    }

    await this.postMessage(to, params, credentials, {
      description: `template ${template.templateId}`,
    });
  }

  private async postMessage(
    to: string,
    params: URLSearchParams,
    credentials: TwilioCredentials,
    options?: { description?: string },
  ): Promise<void> {
    const url = `${this.config.apiBaseUrl}/Accounts/${credentials.accountSid}/Messages.json`;
    const from = ensureWhatsAppPrefix(credentials.phoneNumberId);
    const toAddress = ensureWhatsAppPrefix(to);

    params.append('From', from);
    params.append('To', toAddress);

    this.logger.log(
      `Sending ${
        options?.description ?? 'message'
      } from=${from} to=${toAddress}`,
    );

    const basicAuth = Buffer.from(
      `${credentials.accountSid}:${credentials.authToken}`,
      'utf8',
    ).toString('base64');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
        body: params,
      });
    } catch (error) {
      const cause = error instanceof Error ? (error as any).cause : undefined;
      this.logger.error(
        `fetch failed phoneNumberId=${credentials.phoneNumberId} to=${to}: ${
          error instanceof Error ? error.message : String(error)
        }` +
          (cause
            ? ` | cause: ${
                cause instanceof Error ? cause.message : String(cause)
              }`
            : ''),
      );
      throw error;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Send failed phoneNumberId=${credentials.phoneNumberId} to=${to} status=${response.status} body=${errorBody}`,
      );
      throw new Error(`WhatsApp Twilio API error: ${response.status}`);
    }

    this.logger.log(
      `Message sent phoneNumberId=${credentials.phoneNumberId} to=${to}`,
    );
  }
}
