import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let mockOnboardingService: any;

  const mockResult = {
    user: { _id: 'user-1', email: 'test@example.com', name: 'Test', clientId: 'client-1', status: 'active' },
    client: { _id: 'client-1', name: 'Test', type: 'individual', ownerUserId: 'user-1', status: 'active' },
    clientAgent: { _id: 'ca-1', clientId: 'client-1', agentId: 'agent-1', price: 100, status: 'active' },
    agentChannels: [{ _id: 'ac-1', clientId: 'client-1', agentId: 'agent-1', channelId: 'ch-1', status: 'active', channelConfig: {}, llmConfig: { provider: 'openai', model: 'gpt-4' } }],
  };

  beforeEach(async () => {
    mockOnboardingService = {
      registerAndHire: jest.fn().mockResolvedValue(mockResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        { provide: OnboardingService, useValue: mockOnboardingService },
      ],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('registerAndHire', () => {
    it('should call service and return result', async () => {
      const dto = {
        user: { email: 'test@example.com', name: 'Test' },
        client: { type: 'individual' as const },
        agentHiring: { agentId: 'agent-1', price: 100 },
        channels: [],
      };

      const result = await controller.registerAndHire(dto);

      expect(mockOnboardingService.registerAndHire).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
    });
  });
});
