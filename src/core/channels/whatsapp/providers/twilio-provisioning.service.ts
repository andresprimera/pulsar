import { Injectable, Logger } from '@nestjs/common';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { stripWhatsAppPrefix } from '@channels/whatsapp/utils/whatsapp-address.util';
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
  /**
   * The number's SMS webhook. Named for what it is: Twilio does NOT deliver
   * inbound WhatsApp here — see `TwilioWhatsAppSender.inboundWebhookUrl`.
   */
  smsWebhookUrl?: string;
}

/**
 * A WhatsApp sender registered on a platform-owned number. Twilio delivers
 * inbound WhatsApp to the sender's callback URL, so this — not the phone
 * number's SMS webhook — decides whether messages reach Pulsar.
 */
export interface TwilioWhatsAppSender {
  sid: string;
  phoneNumber: string;
  status?: string;
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

interface TwilioSenderResource {
  sid?: string;
  /** `whatsapp:+15017122661` */
  sender_id?: string;
  status?: string;
  webhook?: { callback_url?: string };
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
  private readonly messagingApiBaseUrl: string;

  constructor(private readonly channelEnvService: ChannelEnvService) {
    this.apiBaseUrl =
      process.env.WHATSAPP_TWILIO_API_BASE_URL ||
      'https://api.twilio.com/2010-04-01';
    this.messagingApiBaseUrl =
      process.env.WHATSAPP_TWILIO_MESSAGING_API_BASE_URL ||
      'https://messaging.twilio.com';
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

  /** Single-number ownership lookup, used before binding a number to a hire. */
  async findOwnedNumber(
    phoneNumber: string,
  ): Promise<ProvisionedTwilioNumber | undefined> {
    const { accountSid } = this.requireCredentials();
    const canonical = normalizeToE164(phoneNumber);
    const query = new URLSearchParams({ PhoneNumber: canonical });
    const response = await this.request<{
      incoming_phone_numbers?: TwilioIncomingNumberResource[];
    }>(
      'GET',
      `/Accounts/${accountSid}/IncomingPhoneNumbers.json?${query.toString()}`,
    );

    const match = (response.incoming_phone_numbers ?? []).find(
      (number) => normalizeToE164(number.phone_number ?? '') === canonical,
    );
    return match ? this.toProvisionedNumber(match) : undefined;
  }

  /** WhatsApp senders registered in the platform account. */
  async listWhatsAppSenders(limit = 100): Promise<TwilioWhatsAppSender[]> {
    const response = await this.requestMessagingJson<{
      senders?: TwilioSenderResource[];
    }>('GET', `/v2/Channels/Senders?Channel=whatsapp&PageSize=${limit}`);

    return (response.senders ?? []).map((sender) =>
      this.toWhatsAppSender(sender),
    );
  }

  async findWhatsAppSender(
    phoneNumber: string,
  ): Promise<TwilioWhatsAppSender | undefined> {
    const canonical = normalizeToE164(phoneNumber);
    const senders = await this.listWhatsAppSenders();
    return senders.find((sender) => sender.phoneNumber === canonical);
  }

  /**
   * Repoints a registered WhatsApp sender at this server. Inbound WhatsApp is
   * delivered to the sender's callback URL, so this is what makes a
   * platform-owned number reachable by Pulsar.
   */
  async configureSenderWebhook(
    senderSid: string,
  ): Promise<TwilioWhatsAppSender> {
    const callbackUrl = this.getInboundWebhookUrl();

    this.logger.log(
      `Pointing Twilio WhatsApp sender sid=${senderSid} at ${callbackUrl}`,
    );
    const response = await this.requestMessagingJson<TwilioSenderResource>(
      'POST',
      `/v2/Channels/Senders/${senderSid}`,
      { webhook: { callback_url: callbackUrl, callback_method: 'POST' } },
    );

    return this.toWhatsAppSender(response);
  }

  /**
   * Buys a number and points its SMS webhook at this server.
   *
   * This does NOT make the number reachable over WhatsApp: that requires a
   * registered WhatsApp sender whose callback URL points here
   * (`configureSenderWebhook`).
   */
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

  /** Repoints an already-owned number's SMS webhook at this server. */
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
      smsWebhookUrl: resource.sms_url,
    };
  }

  private toWhatsAppSender(
    resource: TwilioSenderResource,
  ): TwilioWhatsAppSender {
    return {
      sid: resource.sid ?? '',
      phoneNumber: normalizeToE164(
        stripWhatsAppPrefix(resource.sender_id ?? ''),
      ),
      status: resource.status,
      inboundWebhookUrl: resource.webhook?.callback_url,
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
    return this.send<T>(method, `${this.apiBaseUrl}${path}`, body);
  }

  /** Senders live on the Messaging API host and speak JSON, not form bodies. */
  private async requestMessagingJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    return this.send<T>(
      method,
      `${this.messagingApiBaseUrl}${path}`,
      body === undefined ? undefined : JSON.stringify(body),
      { 'Content-Type': 'application/json' },
    );
  }

  private async send<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: URLSearchParams | string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const { accountSid, authToken } = this.requireCredentials();
    const basicAuth = Buffer.from(
      `${accountSid}:${authToken}`,
      'utf8',
    ).toString('base64');

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Basic ${basicAuth}`, ...extraHeaders },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Twilio provisioning call failed ${method} ${url} status=${response.status} body=${errorBody}`,
      );
      throw new Error(`Twilio provisioning API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
