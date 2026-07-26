import { ChannelProviderValue } from './channel-provider.constants';

/**
 * Normalizes a phone number to E.164 format (with leading +).
 * Used when saving and when matching so DB and routing use a single canonical form.
 * Idempotent: values already starting with + are returned unchanged; digits-only get + prepended.
 */
export function normalizeToE164(value: string): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (/^\d+$/.test(trimmed)) return '+' + trimmed;
  return trimmed;
}

/**
 * True when the provider addresses a WhatsApp sender by its phone number.
 *
 * Only Twilio does. Cloud API providers (Meta, 360dialog) address a WABA by an
 * opaque numeric `phone_number_id` which is a Graph resource id, not an MSISDN:
 * prefixing it with `+` corrupts every outbound request path.
 */
export function routesByPhoneNumber(
  provider: ChannelProviderValue | string | undefined,
): boolean {
  return provider?.trim().toLowerCase() === 'twilio';
}

/** E.164-normalizes a routing identifier only for phone-number-addressed providers. */
export function normalizeRoutingIdentifier(
  provider: ChannelProviderValue | string | undefined,
  value: string,
): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();
  return routesByPhoneNumber(provider) ? normalizeToE164(trimmed) : trimmed;
}

/**
 * Lookup forms for a routing identifier that may have been stored either raw
 * (Cloud API `phone_number_id`) or E.164-mangled by an older write path.
 * Order is not significant; callers use `$in`.
 */
export function routingIdentifierLookupValues(value: string): string[] {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const e164 = normalizeToE164(trimmed);
  const withoutPlus = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  return [...new Set([trimmed, e164, withoutPlus])];
}
