import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { AgentInput } from './contracts/agent-input';
import { AgentContext } from './contracts/agent-context';
import * as llmFactory from './llm/llm.factory';
import * as ai from 'ai';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('./llm/llm.factory', () => ({
  createLLMModel: jest.fn(),
}));

describe('AgentService', () => {
  let service: AgentService;
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  const mockInput: AgentInput = {
    channel: 'whatsapp',
    externalUserId: '1234567890',
    conversationId: 'phone123:1234567890',
    message: { type: 'text', text: 'Hello, world!' },
  };

  const mockContext: AgentContext = {
    agentId: 'agent-1',
    clientId: 'client-1',
    systemPrompt: 'You are a helpful assistant.',
    llmConfig: { provider: 'openai', apiKey: 'sk-mock', model: 'gpt-4' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentService],
    }).compile();

    service = module.get<AgentService>(AgentService);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('run', () => {
    it('should call generateText with correct parameters', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'AI response' });

      const result = await service.run(mockInput, mockContext);

      expect(llmFactory.createLLMModel).toHaveBeenCalledWith(
        mockContext.llmConfig,
      );
      expect(ai.generateText).toHaveBeenCalledWith({
        model: mockModel,
        system: mockContext.systemPrompt,
        prompt: mockInput.message.text,
      });
      expect(result).toEqual({
        reply: { type: 'text', text: 'AI response' },
      });
    });

    it('should return fallback for empty AI response', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: '   ' });

      const result = await service.run(mockInput, mockContext);

      expect(result).toEqual({
        reply: {
          type: 'text',
          text: "I'm having trouble responding right now.",
        },
      });
    });

    it('should return fallback response on error', async () => {
      (llmFactory.createLLMModel as jest.Mock).mockImplementation(() => {
        throw new Error('API error');
      });

      const result = await service.run(mockInput, mockContext);

      expect(result).toEqual({
        reply: {
          type: 'text',
          text: "I'm having trouble responding right now.",
        },
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log agent and client info before and after call', async () => {
      const mockModel = {};
      (llmFactory.createLLMModel as jest.Mock).mockReturnValue(mockModel);
      (ai.generateText as jest.Mock).mockResolvedValue({ text: 'response' });

      await service.run(mockInput, mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Agent] agent-1 for client client-1 using provider=openai model=gpt-4',
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Agent] Response generated for agent-1',
      );
    });
  });
});
