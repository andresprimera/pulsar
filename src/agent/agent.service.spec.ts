import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { AgentInput } from './contracts/agent-input';
import { AgentContext } from './contracts/agent-context';

describe('AgentService', () => {
  let service: AgentService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentService],
    }).compile();

    service = module.get<AgentService>(AgentService);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('run', () => {
    const mockInput: AgentInput = {
      channel: 'whatsapp',
      externalUserId: '1234567890',
      conversationId: 'phone123:1234567890',
      message: {
        type: 'text',
        text: 'Hello, world!',
      },
    };

    const mockContext: AgentContext = {
      agentId: 'agent-1',
      clientId: 'client-1',
      channelType: 'whatsapp',
      systemPrompt: 'You are a helpful assistant.',
      llmConfig: {
        provider: 'openai',
        apiKey: 'sk-mock-key',
        model: 'gpt-4',
      },
    };

    it('should return echo response with input text', async () => {
      const result = await service.run(mockInput, mockContext);

      expect(result).toEqual({
        reply: {
          type: 'text',
          text: 'Hello, world!',
        },
      });
    });

    it('should log agent and client info with LLM config', async () => {
      await service.run(mockInput, mockContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Agent] agent-1 for client client-1 would use provider=openai model=gpt-4',
      );
    });
  });
});
