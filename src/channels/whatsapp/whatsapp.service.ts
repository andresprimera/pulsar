import { Injectable, ForbiddenException } from '@nestjs/common';
import { AgentService } from '../../agent/agent.service';
import { AgentInput } from '../../agent/contracts/agent-input';
import { AgentContext } from '../../agent/contracts/agent-context';
import { AgentChannelRepository } from '../../database/repositories/agent-channel.repository';
import { AgentRepository } from '../../database/repositories/agent.repository';

const VERIFY_TOKEN = 'test-token';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentChannelRepository: AgentChannelRepository,
    private readonly agentRepository: AgentRepository,
  ) {}

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return challenge;
    }
    throw new ForbiddenException('Verification failed');
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

    const agentChannel =
      await this.agentChannelRepository.findByPhoneNumberId(phoneNumberId);

    if (!agentChannel) {
      console.warn(
        `[WhatsApp] No agent_channel found for phoneNumberId=${phoneNumberId}`,
      );
      return;
    }

    const agent = await this.agentRepository.findById(agentChannel.agentId);

    const context: AgentContext = {
      agentId: agentChannel.agentId,
      clientId: agentChannel.clientId,
      systemPrompt: agent?.systemPrompt ?? '',
      llmConfig: agentChannel.llmConfig,
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
      console.log(
        `[WhatsApp] Sending to ${message.from}: ${output.reply.text}`,
      );
    }
  }
}
