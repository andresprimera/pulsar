import { createLLMModel, LLMConfig } from './llm.factory';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => jest.fn(() => 'openai-model')),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => jest.fn(() => 'anthropic-model')),
}));

describe('LLM Factory', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should create OpenAI model', () => {
    const result = createLLMModel({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4',
    });
    expect(result).toBe('openai-model');
  });

  it('should create Anthropic model', () => {
    const result = createLLMModel({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-3-haiku',
    });
    expect(result).toBe('anthropic-model');
  });

  it('should throw for unsupported provider', () => {
    expect(() =>
      createLLMModel({
        provider: 'unknown' as LLMConfig['provider'],
        apiKey: 'key',
        model: 'model',
      }),
    ).toThrow('Unsupported LLM provider: unknown');
  });
});
