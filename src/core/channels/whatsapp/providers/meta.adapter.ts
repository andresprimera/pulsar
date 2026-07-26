import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import {
  WhatsAppProviderAdapter,
  ParsedWhatsAppInbound,
  MetaCredentials,
} from './whatsapp-provider.interface';
import { parseCloudApiWebhook } from '@channels/whatsapp-common/cloud-api-webhook.parser';
import { normalizeToE164 } from '@shared/e164.util';

interface MetaCloudApiConfig {
  apiHost: string;
  apiVersion: string;
  webhookVerifyToken: string;
}

@Injectable()
export class MetaWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = ChannelProvider.Meta;
  private readonly logger = new Logger(MetaWhatsAppAdapter.name);
  private readonly config: MetaCloudApiConfig;

  constructor() {
    this.config = {
      apiHost: process.env.WHATSAPP_API_HOST || 'https://graph.facebook.com',
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'dev',
    };
  }

  parseInbound(payload: unknown): ParsedWhatsAppInbound | undefined {
    const parsed = parseCloudApiWebhook(payload);
    if (!parsed) return undefined;
    return {
      ...parsed,
      // phone_number_id is a Graph resource id, not an MSISDN — leave it raw.
      phoneNumberId: parsed.phoneNumberId.trim(),
      senderId: normalizeToE164(parsed.senderId),
    };
  }

  async sendMessage(
    to: string,
    text: string,
    credentials: MetaCredentials,
  ): Promise<void> {
    const url = `${this.config.apiHost}/${this.config.apiVersion}/${credentials.phoneNumberId}/messages`;

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    });

    this.logger.log(
      `Sending message phoneNumberId=${credentials.phoneNumberId} to=${to}`,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.accessToken}`,
        },
        body,
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
      throw new Error(`WhatsApp Meta API error: ${response.status}`);
    }

    this.logger.log(
      `Message sent phoneNumberId=${credentials.phoneNumberId} to=${to}`,
    );
  }

  verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): string | undefined {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
  }
}
