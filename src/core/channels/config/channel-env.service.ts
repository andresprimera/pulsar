import { Injectable } from '@nestjs/common';

/**
 * Platform-level authentication credentials from environment.
 * Used as fallback when DB credentials are missing. Does NOT include routing
 * identifiers (phoneNumberId, instagramAccountId, tiktokUserId) — those must
 * always come from the DB per client.
 */
export interface WhatsAppMetaEnvCredentials {
  accessToken: string;
}

export interface WhatsApp360EnvCredentials {
  apiKey: string;
}

export interface WhatsAppTwilioEnvCredentials {
  accountSid: string;
  authToken: string;
}

export interface InstagramEnvCredentials {
  accessToken: string;
}

export interface TikTokEnvCredentials {
  accessToken: string;
}

/**
 * Centralized read of channel **authentication credentials** from environment.
 * Routing identifiers are never read from .env; they must come from the DB.
 */
@Injectable()
export class ChannelEnvService {
  /**
   * WhatsApp Meta: WHATSAPP_META_ACCESS_TOKEN only (no phoneNumberId from env).
   */
  getWhatsAppMetaCredentials(): WhatsAppMetaEnvCredentials | undefined {
    const accessToken = process.env.WHATSAPP_META_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      return undefined;
    }
    return { accessToken };
  }

  /**
   * WhatsApp Dialog360: WHATSAPP_DIALOG360_API_KEY only (no phoneNumberId from env).
   */
  getWhatsApp360Credentials(): WhatsApp360EnvCredentials | undefined {
    const apiKey = process.env.WHATSAPP_DIALOG360_API_KEY?.trim();
    if (!apiKey) {
      return undefined;
    }
    return { apiKey };
  }

  /**
   * WhatsApp Twilio: WHATSAPP_TWILIO_ACCOUNT_SID and WHATSAPP_TWILIO_AUTH_TOKEN only (no phoneNumberId from env).
   */
  getWhatsAppTwilioCredentials(): WhatsAppTwilioEnvCredentials | undefined {
    const accountSid = process.env.WHATSAPP_TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.WHATSAPP_TWILIO_AUTH_TOKEN?.trim();
    if (!accountSid || !authToken) {
      return undefined;
    }
    return { accountSid, authToken };
  }

  /**
   * Instagram: INSTAGRAM_ACCESS_TOKEN only (no account ID from env).
   */
  getInstagramCredentials(): InstagramEnvCredentials | undefined {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      return undefined;
    }
    return { accessToken };
  }

  /**
   * TikTok: TIKTOK_ACCESS_TOKEN only (no user ID from env).
   */
  getTikTokCredentials(): TikTokEnvCredentials | undefined {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN?.trim();
    if (!accessToken) {
      return undefined;
    }
    return { accessToken };
  }

  /**
   * Public base URL this server is reachable at (e.g. https://api.example.com).
   * Infrastructure config, not a credential: providers that sign webhooks sign the
   * exact public URL, which cannot be trusted from proxied request headers.
   */
  getPublicBaseUrl(): string | undefined {
    const baseUrl = process.env.PUBLIC_BASE_URL?.trim();
    if (!baseUrl) {
      return undefined;
    }
    return baseUrl.replace(/\/+$/, '');
  }

  /**
   * Returns true if any env var for WhatsApp Meta is set (used by validator).
   */
  hasAnyWhatsAppMetaEnv(): boolean {
    return Boolean(process.env.WHATSAPP_META_ACCESS_TOKEN?.trim());
  }

  /**
   * Returns true if any env var for WhatsApp Dialog360 is set.
   */
  hasAnyWhatsApp360Env(): boolean {
    return Boolean(process.env.WHATSAPP_DIALOG360_API_KEY?.trim());
  }

  /**
   * Returns true if any env var for WhatsApp Twilio is set.
   */
  hasAnyWhatsAppTwilioEnv(): boolean {
    return (
      Boolean(process.env.WHATSAPP_TWILIO_ACCOUNT_SID?.trim()) ||
      Boolean(process.env.WHATSAPP_TWILIO_AUTH_TOKEN?.trim())
    );
  }

  /**
   * Returns true if any env var for Instagram is set.
   */
  hasAnyInstagramEnv(): boolean {
    return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN?.trim());
  }

  /**
   * Returns true if any env var for TikTok is set.
   */
  hasAnyTikTokEnv(): boolean {
    return Boolean(process.env.TIKTOK_ACCESS_TOKEN?.trim());
  }
}
