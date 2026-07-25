import { Injectable, Logger } from '@nestjs/common';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { normalizeToE164 } from '@shared/e164.util';

/** Inbound webhook path Twilio numbers are pointed at. */
export const TWILIO_WHATSAPP_WEBHOOK_PATH = '/whatsapp/webhook/twilio';

export interface AvailableTwilioNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  isoCountry?: string;
}

export interface ProvisionedTwilioNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  inboundWebhookUrl?: string;
}

export interface SearchAvailableNumbersParams {
  countryCode: string;
  areaCode?: string;
  contains?: string;
  limit?: number;
}

interface TwilioAvailableNumberResource {
  phone_number?: string;
  friendly_name?: string;
  locality?: string;
  region?: string;
  iso_country?: string;
}

interface TwilioIncomingNumberResource {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
  sms_url?: string;
}

/**
 * Twilio REST calls that provision platform-owned numbers.
 *
 * Transport-only: performs provider HTTP and returns plain results. It never
 * touches persistence — assigning a number to a client is a feature concern.
 */
@Injectable()
export class TwilioNumberProvisioningService {
  private readonly logger = new Logger(TwilioNumberProvisioningService.name);
  private readonly apiBaseUrl: string;

  constructor(private readonly channelEnvService: ChannelEnvService) {
    this.apiBaseUrl =
      process.env.WHATSAPP_TWILIO_API_BASE_URL ||
      'https://api.twilio.com/2010-04-01';
  }

  /**
   * The URL Twilio delivers inbound WhatsApp messages to. Signature validation
   * recomputes this exact string, so provisioning and verification must agree.
   */
  getInboundWebhookUrl(): string {
    const baseUrl = this.channelEnvService.getPublicBaseUrl();
    if (!baseUrl) {
      throw new Error(
        'Cannot resolve the Twilio inbound webhook URL: PUBLIC_BASE_URL is not set.',
      );
    }
    return baseUrl + TWILIO_WHATSAPP_WEBHOOK_PATH;
  }

  async searchAvailableNumbers(
    params: SearchAvailableNumbersParams,
  ): Promise<AvailableTwilioNumber[]> {
    const { accountSid } = this.requireCredentials();
    const query = new URLSearchParams({ SmsEnabled: 'true' });
    if (params.areaCode) {
      query.append('AreaCode', params.areaCode);
    }
    if (params.contains) {
      query.append('Contains', params.contains);
    }
    query.append('PageSize', String(params.limit ?? 20));

    const country = params.countryCode.trim().toUpperCase();
    const response = await this.request<{
      available_phone_numbers?: TwilioAvailableNumberResource[];
    }>(
      'GET',
      `/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/Local.json?${query.toString()}`,
    );

    return (response.available_phone_numbers ?? []).map((number) => ({
      phoneNumber: normalizeToE164(number.phone_number ?? ''),
      friendlyName: number.friendly_name ?? '',
      locality: number.locality,
      region: number.region,
      isoCountry: number.iso_country,
    }));
  }

  async listOwnedNumbers(limit = 100): Promise<ProvisionedTwilioNumber[]> {
    const { accountSid } = this.requireCredentials();
    const response = await this.request<{
      incoming_phone_numbers?: TwilioIncomingNumberResource[];
    }>(
      'GET',
      `/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=${limit}`,
    );

    return (response.incoming_phone_numbers ?? []).map((number) =>
      this.toProvisionedNumber(number),
    );
  }

  /** Buys a number and points it at this server in a single step. */
  async purchaseNumber(
    phoneNumber: string,
    friendlyName?: string,
  ): Promise<ProvisionedTwilioNumber> {
    const { accountSid } = this.requireCredentials();
    const webhookUrl = this.getInboundWebhookUrl();
    const canonical = normalizeToE164(phoneNumber);

    const body = new URLSearchParams({
      PhoneNumber: canonical,
      SmsUrl: webhookUrl,
      SmsMethod: 'POST',
    });
    if (friendlyName) {
      body.append('FriendlyName', friendlyName);
    }

    this.logger.log(`Purchasing Twilio number ${canonical}`);
    const response = await this.request<TwilioIncomingNumberResource>(
      'POST',
      `/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      body,
    );

    return this.toProvisionedNumber(response);
  }

  /** Repoints an already-owned number at this server's webhook. */
  async configureInboundWebhook(
    phoneNumberSid: string,
  ): Promise<ProvisionedTwilioNumber> {
    const { accountSid } = this.requireCredentials();
    const webhookUrl = this.getInboundWebhookUrl();

    const body = new URLSearchParams({
      SmsUrl: webhookUrl,
      SmsMethod: 'POST',
    });

    this.logger.log(
      `Configuring inbound webhook for Twilio number sid=${phoneNumberSid}`,
    );
    const response = await this.request<TwilioIncomingNumberResource>(
      'POST',
      `/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
      body,
    );

    return this.toProvisionedNumber(response);
  }

  private toProvisionedNumber(
    resource: TwilioIncomingNumberResource,
  ): ProvisionedTwilioNumber {
    return {
      sid: resource.sid ?? '',
      phoneNumber: normalizeToE164(resource.phone_number ?? ''),
      friendlyName: resource.friendly_name ?? '',
      inboundWebhookUrl: resource.sms_url,
    };
  }

  private requireCredentials(): { accountSid: string; authToken: string } {
    const credentials = this.channelEnvService.getWhatsAppTwilioCredentials();
    if (!credentials) {
      throw new Error(
        'Twilio provisioning requires WHATSAPP_TWILIO_ACCOUNT_SID and WHATSAPP_TWILIO_AUTH_TOKEN.',
      );
    }
    return credentials;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: URLSearchParams,
  ): Promise<T> {
    const { accountSid, authToken } = this.requireCredentials();
    const basicAuth = Buffer.from(
      `${accountSid}:${authToken}`,
      'utf8',
    ).toString('base64');

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method,
      headers: { Authorization: `Basic ${basicAuth}` },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Twilio provisioning call failed ${method} ${path} status=${response.status} body=${errorBody}`,
      );
      throw new Error(`Twilio provisioning API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
