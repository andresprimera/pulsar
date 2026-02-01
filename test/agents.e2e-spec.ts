import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('Agents CRUD (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let createdAgentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    // Clean up test agents
    if (connection) {
      await connection.collection('agents').deleteMany({
        name: { $regex: /^E2E Test/ },
      });
    }
    await app.close();
  });

  describe('POST /agents', () => {
    it('should create a new agent with status=active', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .send({
          name: 'E2E Test Agent',
          systemPrompt: 'You are a test assistant.',
        })
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe('E2E Test Agent');
      expect(response.body.systemPrompt).toBe('You are a test assistant.');
      expect(response.body.status).toBe('active');

      createdAgentId = response.body._id;
    });

    it('should create agent with llmOverride', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .send({
          name: 'E2E Test Agent With Override',
          systemPrompt: 'You are helpful.',
          llmOverride: {
            provider: 'openai',
            model: 'gpt-4',
          },
        })
        .expect(201);

      expect(response.body.llmOverride).toEqual({
        provider: 'openai',
        model: 'gpt-4',
      });
    });

    it('should reject invalid payload (missing name)', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .send({
          systemPrompt: 'You are a test assistant.',
        })
        .expect(400);

      expect(response.body.message).toContain('name must be a string');
    });

    it('should reject invalid payload (missing systemPrompt)', async () => {
      const response = await request(app.getHttpServer())
        .post('/agents')
        .send({
          name: 'Test',
        })
        .expect(400);

      expect(response.body.message).toContain('systemPrompt must be a string');
    });
  });

  describe('GET /agents', () => {
    it('should return all agents', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should filter agents by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents')
        .query({ status: 'active' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((agent: any) => {
        expect(agent.status).toBe('active');
      });
    });
  });

  describe('GET /agents/available', () => {
    it('should return only active agents', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents/available')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((agent: any) => {
        expect(agent.status).toBe('active');
      });
    });
  });

  describe('GET /agents/:id', () => {
    it('should return agent by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/agents/${createdAgentId}`)
        .expect(200);

      expect(response.body._id).toBe(createdAgentId);
      expect(response.body.name).toBe('E2E Test Agent');
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .get('/agents/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('PATCH /agents/:id', () => {
    it('should update agent fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}`)
        .send({
          name: 'E2E Test Agent Updated',
        })
        .expect(200);

      expect(response.body.name).toBe('E2E Test Agent Updated');
      expect(response.body.systemPrompt).toBe('You are a test assistant.');
    });

    it('should update llmOverride', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}`)
        .send({
          llmOverride: {
            provider: 'anthropic',
            model: 'claude-3',
          },
        })
        .expect(200);

      expect(response.body.llmOverride).toEqual({
        provider: 'anthropic',
        model: 'claude-3',
      });
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .patch('/agents/507f1f77bcf86cd799439011')
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('PATCH /agents/:id/status', () => {
    it('should update agent status to inactive', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}/status`)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body.status).toBe('inactive');
    });

    it('should update agent status back to active', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}/status`)
        .send({ status: 'active' })
        .expect(200);

      expect(response.body.status).toBe('active');
    });

    it('should reject invalid status value', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${createdAgentId}/status`)
        .send({ status: 'deleted' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('status must be one of'),
        ]),
      );
    });

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .patch('/agents/507f1f77bcf86cd799439011/status')
        .send({ status: 'inactive' })
        .expect(404);
    });
  });

  describe('Archived agent immutability', () => {
    let archivedAgentId: string;

    beforeAll(async () => {
      // Create a new agent specifically for archive tests
      const createResponse = await request(app.getHttpServer())
        .post('/agents')
        .send({
          name: 'E2E Test Agent To Archive',
          systemPrompt: 'Will be archived.',
        });

      archivedAgentId = createResponse.body._id;

      // Archive it
      await request(app.getHttpServer())
        .patch(`/agents/${archivedAgentId}/status`)
        .send({ status: 'archived' });
    });

    it('should not allow updating archived agent fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${archivedAgentId}`)
        .send({ name: 'Should Not Update' })
        .expect(400);

      expect(response.body.message).toBe('Archived agents cannot be modified');
    });

    it('should not allow changing archived agent status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/agents/${archivedAgentId}/status`)
        .send({ status: 'active' })
        .expect(400);

      expect(response.body.message).toBe('Archived agents cannot be modified');
    });

    it('archived agent should still be readable', async () => {
      const response = await request(app.getHttpServer())
        .get(`/agents/${archivedAgentId}`)
        .expect(200);

      expect(response.body.status).toBe('archived');
    });

    it('archived agent should not appear in available list', async () => {
      const response = await request(app.getHttpServer())
        .get('/agents/available')
        .expect(200);

      const archivedAgent = response.body.find(
        (a: any) => a._id === archivedAgentId,
      );
      expect(archivedAgent).toBeUndefined();
    });
  });
});
