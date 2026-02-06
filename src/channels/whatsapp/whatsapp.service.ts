import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentChannelRepository } from '../../database/repositories/agent-channel.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';
import { ClientPhoneRepository } from '../../database/repositories/client-phone.repository';

const VERIFY_TOKEN = 'test-token';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly agentChannelRepository: AgentChannelRepository,
    private readonly agentRepository: AgentRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
  ) {}

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
  }

  private async sendMessage(to: string, text: string): Promise<void> {
    const url = 'http://localhost:3005/whatsapp/send';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `[WhatsApp] Failed to send message: ${response.status} ${errorBody}`,
      );
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    this.logger.log(`[WhatsApp] Message sent successfully to ${to}`);
  }

  async handleIncoming(payload: any): Promise<void> {
    // TODO: deduplicate message.id to avoid double-processing

    if (!payload.entry?.[0]?.changes?.[0]?.value?.messages) {
      return;
    }

    const value = payload.entry[0].changes[0].value;
    const message = value.messages[0];

    if (message.type !== 'text') {
      return;
    }

    const phoneNumberId = value.metadata?.phone_number_id;

    this.logger.log(
      `[WhatsApp] Incoming message metdata: ${JSON.stringify(value.metadata)}`,
    );
    this.logger.log(`[WhatsApp] Extracted phoneNumberId: ${phoneNumberId}`);

    // Find the ClientPhone by phoneNumberId
    const clientPhone =
      await this.clientPhoneRepository.findByPhoneNumber(phoneNumberId);

    if (!clientPhone) {
      this.logger.warn(
        `[WhatsApp] No ClientPhone found for phoneNumberId=${phoneNumberId}. Phone may not be registered.`,
      );
      return;
    }

    // Find AgentChannel by clientPhoneId
    const agentChannel =
      await this.agentChannelRepository.findByClientPhoneId(clientPhone._id);

    if (!agentChannel) {
      this.logger.warn(
        `[WhatsApp] No active agent_channel found for clientPhoneId=${clientPhone._id}. Check if channel exists and is active.`,
      );
      return;
    }

    const agent = await this.agentRepository.findById(agentChannel.agentId);

    const context: AgentContext = {
      agentId: agentChannel.agentId,
      clientId: agentChannel.clientId,
      systemPrompt: agent?.systemPrompt ?? '',
      llmConfig: {
        ...agentChannel.llmConfig,
        apiKey: process.env.OPENAI_API_KEY, // TODO: Remove - temporary override for testing
      },
      channelConfig: agentChannel.channelConfig,
    };

    const input: AgentInput = {
      channel: 'whatsapp',
      externalUserId: message.from,
      conversationId: `${phoneNumberId}:${message.from}`,
      message: {
        type: 'text',
        text: message.text.body,
      },
      metadata: {
        messageId: message.id,
        phoneNumberId,
      },
    };

    const output = await this.agentService.run(input, context);

    if (output.reply) {
      this.logger.log(
        `[WhatsApp] Sending to ${message.from}: ${output.reply.text}`,
      );

      await this.sendMessage(message.from, output.reply.text);
    }
  }
}
