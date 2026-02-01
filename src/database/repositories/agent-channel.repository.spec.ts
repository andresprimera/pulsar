import { Test, TestingModule } from '@nestjs/testing';
import { AgentChannelRepository } from './agent-channel.repository';

describe('AgentChannelRepository', () => {
  let repository: AgentChannelRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentChannelRepository],
    }).compile();

    repository = module.get<AgentChannelRepository>(AgentChannelRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should return agent channel when exists', async () => {
      const result = await repository.findById('ac-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('ac-1');
      expect(result?.clientId).toBe('client-1');
      expect(result?.agentId).toBe('agent-1');
      expect(result?.channelType).toBe('whatsapp');
    });

    it('should return undefined when not exists', async () => {
      const result = await repository.findById('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all agent channels', async () => {
      const result = await repository.findAll();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('clientId');
      expect(result[0]).toHaveProperty('agentId');
      expect(result[0]).toHaveProperty('channelType');
      expect(result[0]).toHaveProperty('channelConfig');
      expect(result[0]).toHaveProperty('llmConfig');
    });
  });

  describe('findByPhoneNumberId', () => {
    it('should return enabled whatsapp channel for valid phoneNumberId', async () => {
      const result = await repository.findByPhoneNumberId('phone123');

      expect(result).toBeDefined();
      expect(result?.channelConfig.phoneNumberId).toBe('phone123');
      expect(result?.channelType).toBe('whatsapp');
      expect(result?.enabled).toBe(true);
    });

    it('should return undefined for unknown phoneNumberId', async () => {
      const result = await repository.findByPhoneNumberId('unknown-phone');

      expect(result).toBeUndefined();
    });
  });
});
