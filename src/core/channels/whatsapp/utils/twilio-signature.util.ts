import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Twilio signs the request URL followed by every POST parameter, sorted by key,
 * with each key immediately followed by its value and no separators.
 */
function buildSignatureBase(
  url: string,
  params: Record<string, string>,
): string {
  return Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
}

/**
 * Flattens a parsed form-urlencoded body into the flat string map Twilio signs.
 * Nested or repeated values are coerced so signing never throws on odd payloads.
 */
export function toSignatureParams(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>,
  )) {
    params[key] = value === undefined || value === null ? '' : String(value);
  }
  return params;
}

export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  return createHmac('sha1', authToken)
    .update(buildSignatureBase(url, params), 'utf8')
    .digest('base64');
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!authToken || !signature) {
    return false;
  }

  const expected = new Uint8Array(
    Buffer.from(computeTwilioSignature(authToken, url, params), 'utf8'),
  );
  const provided = new Uint8Array(Buffer.from(signature, 'utf8'));

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
