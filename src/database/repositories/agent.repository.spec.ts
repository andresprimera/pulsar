import { Test, TestingModule } from '@nestjs/testing';
import { AgentRepository } from './agent.repository';

describe('AgentRepository', () => {
  let repository: AgentRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentRepository],
    }).compile();

    repository = module.get<AgentRepository>(AgentRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should return agent when exists', async () => {
      const result = await repository.findById('agent-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('agent-1');
      expect(result?.name).toBe('Support Bot');
      expect(result?.systemPrompt).toBe('You are a helpful support assistant.');
    });

    it('should return undefined when not exists', async () => {
      const result = await repository.findById('non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all agents', async () => {
      const result = await repository.findAll();

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('systemPrompt');
    });
  });
});
