import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { LanguageModel } from 'ai';

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
}

export function createLLMModel(config: LLMConfig): LanguageModel {
  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return anthropic(config.model);
    }
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
