import { Injectable } from '@nestjs/common';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';
import { AgentContext } from './contracts/agent-context';

@Injectable()
export class AgentService {
  async run(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    console.log(
      `[Agent] ${context.agentId} for client ${context.clientId} ` +
        `would use provider=${context.llmConfig.provider} model=${context.llmConfig.model}`,
    );

    return {
      reply: {
        type: 'text',
        text: input.message.text,
      },
    };
  }
}
