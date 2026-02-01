import { Injectable } from '@nestjs/common';
import { generateText } from 'ai';
import { AgentInput } from './contracts/agent-input';
import { AgentOutput } from './contracts/agent-output';
import { AgentContext } from './contracts/agent-context';
import { createLLMModel } from './llm/llm.factory';

@Injectable()
export class AgentService {
  async run(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    console.log(
      `[Agent] ${context.agentId} for client ${context.clientId} ` +
        `using provider=${context.llmConfig.provider} model=${context.llmConfig.model}`,
    );

    try {
      const model = createLLMModel(context.llmConfig);

      const { text } = await generateText({
        model,
        system: context.systemPrompt,
        prompt: input.message.text,
      });

      const safeText =
        text?.trim() || "I'm having trouble responding right now.";

      console.log(`[Agent] Response generated for ${context.agentId}`);

      return {
        reply: {
          type: 'text',
          text: safeText,
        },
      };
    } catch (error) {
      console.error(
        `[Agent] Error for ${context.agentId} client ${context.clientId}:`,
        error instanceof Error ? error.message : error,
      );

      return {
        reply: {
          type: 'text',
          text: "I'm having trouble responding right now.",
        },
      };
    }
  }
}
