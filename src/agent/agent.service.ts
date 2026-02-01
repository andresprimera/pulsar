import { Injectable } from '@nestjs/common';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';

@Injectable()
export class AgentService {
  async run(input: AgentInput): Promise<AgentOutput> {
    return {
      reply: {
        type: 'text',
        text: input.message.text,
      },
    };
  }
}
