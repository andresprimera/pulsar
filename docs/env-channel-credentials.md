# Channel credential fallback from environment

When a channel config has **no credentials** (or invalid/incomplete credentials) in the DB, the channel layer can use **platform authentication credentials** from the environment as fallback.

**Routing identifiers** (phoneNumberId, instagramAccountId, tiktokUserId) are **never** read from `.env`. They must always be stored per client in the database and determine which client integration handles a message.

## Behavior

- **Routing identifiers** → always from DB (per-client channel config).
- **Authentication credentials** (accessToken, apiKey) → from DB when present and valid; otherwise from `.env` fallback.
- **Both credential sources missing** → runtime error with a clear message.

## Environment variables (authentication only)

`.env` provides **only platform-level authentication credentials**, not routing identifiers.

### WhatsApp Meta

| Variable | Description |
|----------|-------------|
| `WHATSAPP_META_ACCESS_TOKEN` | Access token (fallback when DB credentials missing) |

### WhatsApp Dialog360

| Variable | Description |
|----------|-------------|
| `WHATSAPP_DIALOG360_API_KEY` | API key (fallback when DB credentials missing) |

### WhatsApp Twilio

| Variable | Description |
|----------|-------------|
| `WHATSAPP_TWILIO_ACCOUNT_SID` | Twilio account SID (auth only; routing identifier always from DB, never from env) |
| `WHATSAPP_TWILIO_AUTH_TOKEN` | Twilio auth token (auth only; routing identifier always from DB, never from env) |
| `WHATSAPP_TWILIO_VALIDATE_SIGNATURE` | Set to `true` to enforce `X-Twilio-Signature` validation outside production. Always enforced in production. |
| `WHATSAPP_TWILIO_MESSAGING_API_BASE_URL` | Messaging API host serving the WhatsApp Senders API (defaults to `https://messaging.twilio.com`) |

In the platform-owned model (Pulsar owns the Twilio account and assigns one number
per client), these two variables are the only Twilio credentials needed: each client's
channel config stores just `provider: twilio` and its assigned `phoneNumberId`.

Inbound WhatsApp is delivered to the **WhatsApp sender's** callback URL, not to the
phone number's SMS webhook. Buying a number only configures the latter, so
`GET /whatsapp-numbers` reports `webhookConfigured` from the registered sender and
`POST /whatsapp-numbers/configure-webhook` repoints that sender at this server.

## Public base URL

| Variable | Description |
|----------|-------------|
| `PUBLIC_BASE_URL` | Public origin of this server, e.g. `https://api.example.com` |

Required in production. Twilio computes its webhook signature over the exact public
URL it was configured with, which proxied request headers cannot be trusted to
reproduce. The same value is used when provisioning numbers so the URL Twilio is
pointed at and the URL used to verify signatures always match.

### Instagram

| Variable | Description |
|----------|-------------|
| `INSTAGRAM_ACCESS_TOKEN` | Access token (fallback when DB credentials missing) |

### TikTok

| Variable | Description |
|----------|-------------|
| `TIKTOK_ACCESS_TOKEN` | Access token (fallback when DB credentials missing) |

## Startup validation

`ChannelEnvValidator` runs at application startup. If a credential env var is set, it must be valid; otherwise the application fails to start with an explicit error.

## Architecture

- **Routing identifiers** → always from DB (orchestrator passes `routeChannelIdentifier` from channel config to the channel layer).
- **Credential resolution** → channel layer only; orchestrator does not read `.env`.
- DB credentials remain encrypted at rest; env credentials are runtime-only and not stored in the DB.
- Multi-tenant routing is preserved: each client’s channel config stores its own routing IDs in the DB.
