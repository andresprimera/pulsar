export interface Channel {
  id: string;
  type: 'whatsapp' | 'telegram' | 'web' | 'api';
  provider: 'meta' | 'twilio' | 'custom';
}
