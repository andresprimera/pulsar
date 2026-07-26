import { Injectable, Logger } from '@nestjs/common';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import {
  WhatsAppProviderAdapter,
  ParsedWhatsAppInbound,
  Dialog360Credentials,
} from './whatsapp-provider.interface';
import { parseCloudApiWebhook } from '@channels/whatsapp-common/cloud-api-webhook.parser';
import { normalizeToE164 } from '@shared/e164.util';

interface Dialog360Config {
  apiHost: string;
}

@Injectable()
export class Dialog360WhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = ChannelProvider.Dialog360;
  private readonly logger = new Logger(Dialog360WhatsAppAdapter.name);
  private readonly config: Dialog360Config;

  constructor() {
    this.config = {
      apiHost: process.env.DIALOG360_API_HOST || 'https://waba.360dialog.io/v1',
    };
  }

  parseInbound(payload: unknown): ParsedWhatsAppInbound | undefined {
    const parsed = parseCloudApiWebhook(payload);
    if (!parsed) return undefined;
    return {
      ...parsed,
      // phone_number_id is a Cloud API resource id, not an MSISDN — leave it raw.
      phoneNumberId: parsed.phoneNumberId.trim(),
      senderId: normalizeToE164(parsed.senderId),
    };
  }

  async sendMessage(
    to: string,
    text: string,
    credentials: Dialog360Credentials,
  ): Promise<void> {
    const url = `${this.config.apiHost}/messages`;

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
          'D360-API-KEY': credentials.apiKey,
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
      throw new Error(`WhatsApp 360dialog API error: ${response.status}`);
    }

    this.logger.log(
      `Message sent phoneNumberId=${credentials.phoneNumberId} to=${to}`,
    );
  }
}
