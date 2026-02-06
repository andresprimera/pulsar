import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

describe('Onboarding (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let testAgentId: string;

  const cleanup = async () => {
    if (connection) {
      await connection.collection('agents').deleteMany({
        name: { $regex: /^E2E Onboarding/ },
      });
      await connection.collection('clients').deleteMany({
        name: { $regex: /^E2E Onboarding/ },
      });
      await connection.collection('users').deleteMany({
        email: { $regex: /e2e-onboarding/ },
      });
      await connection.collection('clientagents').deleteMany({
        agentId: testAgentId,
      });
      await connection.collection('agent_channels').deleteMany({
        agentId: testAgentId,
      });
      await connection.collection('channels').deleteMany({
        name: { $regex: /^e2e-test-channel/ },
      });
      await connection.collection('client_phones').deleteMany({
        phoneNumberId: { $regex: /^e2e-/ },
      });
    }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());

    try {
      // Remove potential zombie index from previous schema versions
      await connection.collection('agent_channels').dropIndex('channelConfig.phoneNumberId_1');
    } catch (e) {
      // Ignore if index doesn't exist
    }

    await cleanup();

    // Create a test agent for hiring
    const agentResponse = await request(app.getHttpServer())
      .post('/agents')
      .send({
        name: 'E2E Onboarding Test Agent',
        systemPrompt: 'You are a test assistant for onboarding.',
      });

    testAgentId = agentResponse.body._id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function provisionChannel(name: string, type: string) {
    await connection.collection('channels').updateOne(
      { name },
      {
        $set: {
          name,
          type,
          provider: type === 'whatsapp' ? 'meta' : 'custom',
        },
      },
      { upsert: true },
    );
  }

  describe('POST /onboarding/register-and-hire', () => {
    it('should complete full registration flow for individual client', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uniqueEmail = `e2e-onboarding-test-${suffix}@example.com`;

      const channelName = `e2e-test-channel-${suffix}`;
      await provisionChannel(channelName, 'whatsapp');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: uniqueEmail,
            name: 'E2E Onboarding Test User',
          },
          client: {
            type: 'individual',
          },
          agentHiring: {
            agentId: testAgentId,
            price: 99.99,
          },
          channels: [
            {
              name: channelName,
              type: 'whatsapp',
              provider: 'meta',
              agentChannelConfig: {
                channelConfig: {
                  phoneNumberId: `e2e-phone-${suffix}`,
                  accessToken: 'test-token',
                  webhookVerifyToken: 'test-verify',
                },
                llmConfig: {
                  provider: 'openai',
                  apiKey: 'test-key',
                  model: 'gpt-4',
                },
              },
            },
          ],
        })
        .expect(201);

      // Verify response structure
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('client');
      expect(response.body).toHaveProperty('clientAgent');
      expect(response.body).toHaveProperty('agentChannels');

      // Verify user
      expect(response.body.user.email).toBe(uniqueEmail.toLowerCase());
      expect(response.body.user.name).toBe('E2E Onboarding Test User');
      expect(response.body.user.status).toBe('active');

      // Verify client
      expect(response.body.client.type).toBe('individual');
      expect(response.body.client.name).toBe('E2E Onboarding Test User');
      expect(response.body.client.status).toBe('active');

      // Verify clientAgent
      expect(response.body.clientAgent.clientId).toBe(response.body.client._id);
      expect(response.body.clientAgent.agentId).toBe(testAgentId);
      expect(response.body.clientAgent.price).toBe(99.99);

      // Verify agentChannels
      expect(response.body.agentChannels).toHaveLength(1);
      expect(response.body.agentChannels[0].clientId).toBe(
        response.body.client._id,
      );
      expect(response.body.agentChannels[0].agentId).toBe(testAgentId);

      // Verify apiKey is NOT in response
      expect(response.body.agentChannels[0].llmConfig).not.toHaveProperty(
        'apiKey',
      );
    });

    it('should use explicit client name when provided', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uniqueEmail = `e2e-onboarding-test-${suffix}@example.com`;

      const channelName = `e2e-test-channel-${suffix}`;
      await provisionChannel(channelName, 'web');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: uniqueEmail,
            name: 'E2E User Name',
          },
          client: {
            type: 'organization',
            name: `E2E Onboarding Custom Org Name ${suffix}`,
          },
          agentHiring: {
            agentId: testAgentId,
            price: 199.99,
          },
          channels: [
            {
              name: channelName,
              type: 'web',
              agentChannelConfig: {
                channelConfig: {},
                llmConfig: {
                  provider: 'anthropic',
                  apiKey: 'test-key',
                  model: 'claude-3',
                },
              },
            },
          ],
        })
        .expect((res) => {
          if (res.status !== 201) {
            console.error('Explicit Client Name Test Failed:', res.body);
          }
        })
        .expect(201);

      expect(response.body.client.name).toBe(`E2E Onboarding Custom Org Name ${suffix}`);
      expect(response.body.client.type).toBe('organization');
    });

    it('should normalize email to lowercase and trim', async () => {
      const uniqueSuffix = Date.now();

      const channelName = `e2e-test-channel-${uniqueSuffix}`;
      await provisionChannel(channelName, 'api');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `  E2E-ONBOARDING-TEST-${uniqueSuffix}@EXAMPLE.COM  `,
            name: 'E2E Onboarding Test User',
          },
          client: {
            type: 'individual',
          },
          agentHiring: {
            agentId: testAgentId,
            price: 50,
          },
          channels: [
            {
              name: channelName,
              type: 'api',
              agentChannelConfig: {
                channelConfig: {},
                llmConfig: {
                  provider: 'openai',
                  apiKey: 'test-key',
                  model: 'gpt-4',
                },
              },
            },
          ],
        })
        .expect((res) => {
          if (res.status !== 201) {
            console.error('Normalize Email Test Failed:', res.body);
          }
        })
        .expect(201);

      expect(response.body.user.email).toBe(
        `e2e-onboarding-test-${uniqueSuffix}@example.com`,
      );
    });

    it('should return 409 on duplicate email', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uniqueEmail = `e2e-onboarding-test-dup-${suffix}@example.com`;

      const channelName1 = `e2e-test-channel-dup-1-${suffix}`;
      await provisionChannel(channelName1, 'web');

      // First registration
      await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: { email: uniqueEmail, name: 'First User' },
          client: { type: 'individual' },
          agentHiring: { agentId: testAgentId, price: 100 },
          channels: [
            {
              name: channelName1,
              type: 'web',
              agentChannelConfig: {
                channelConfig: {},
                llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4' },
              },
            },
          ],
        })
        .expect((res) => {
          if (res.status !== 201) {
            console.error('Duplicate Email Test (First Reg) Failed:', res.body);
          }
        })
        .expect(201);

      const channelName2 = `e2e-test-channel-dup-2-${suffix}`;
      await provisionChannel(channelName2, 'web');

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: { email: uniqueEmail, name: 'Second User' },
          client: { type: 'individual' },
          agentHiring: { agentId: testAgentId, price: 100 },
          channels: [
            {
              name: channelName2,
              type: 'web',
              agentChannelConfig: {
                channelConfig: {},
                llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4' },
              },
            },
          ],
        })
        .expect(409);

      expect(response.body.message).toContain('email already exists');
    });

    it('should return 409 on duplicate phoneNumberId from another client', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const phoneNumberId = `e2e-dup-phone-${suffix}`;

      const channelName1 = `e2e-test-channel-phone1-${suffix}`;
      await provisionChannel(channelName1, 'whatsapp');

      // First registration
      await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-test-phone1-${suffix}@example.com`,
            name: 'First User',
          },
          client: { type: 'individual' },
          agentHiring: { agentId: testAgentId, price: 100 },
          channels: [
            {
              name: channelName1,
              type: 'whatsapp',
              provider: 'meta',
              agentChannelConfig: {
                channelConfig: {
                  phoneNumberId,
                  accessToken: 'token',
                  webhookVerifyToken: 'verify',
                },
                llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4' },
              },
            },
          ],
        })
        .expect((res) => {
          if (res.status !== 201) {
            console.error('Duplicate Phone Test (First Reg) Failed:', res.body);
          }
        })
        .expect(201);

      const channelName2 = `e2e-test-channel-phone2-${suffix}`;
      await provisionChannel(channelName2, 'whatsapp');

      // Second registration with same phoneNumberId (different client)
      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-test-phone2-${suffix}@example.com`,
            name: 'Second User',
          },
          client: { type: 'individual' },
          agentHiring: { agentId: testAgentId, price: 100 },
          channels: [
            {
              name: channelName2,
              type: 'whatsapp',
              provider: 'meta',
              agentChannelConfig: {
                channelConfig: {
                  phoneNumberId,
                  accessToken: 'token2',
                  webhookVerifyToken: 'verify2',
                },
                llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4' },
              },
            },
          ],
        })
        .expect(409);

      expect(response.body.message).toContain('already owned by another client');
    });

    it('should return 400 when agent is not hireable (inactive)', async () => {
      // Create and deactivate an agent
      const inactiveAgentResponse = await request(app.getHttpServer())
        .post('/agents')
        .send({
          name: 'E2E Onboarding Inactive Agent',
          systemPrompt: 'Test',
        });

      await request(app.getHttpServer())
        .patch(`/agents/${inactiveAgentResponse.body._id}/status`)
        .send({ status: 'inactive' });

      const channelName = `e2e-test-channel-inactive-${Date.now()}`;
      await provisionChannel(channelName, 'web');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-inactive-${Date.now()}@example.com`,
            name: 'Test User',
          },
          client: { type: 'individual' },
          agentHiring: {
            agentId: inactiveAgentResponse.body._id,
            price: 100,
          },
          channels: [
            {
              name: channelName,
              type: 'web',
              agentChannelConfig: {
                channelConfig: {},
                llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4' },
              },
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toBe('Agent is not currently available');
    });

    it('should return 400 when agent does not exist', async () => {
      const channelName = `e2e-test-channel-noagent-${Date.now()}`;
      await provisionChannel(channelName, 'web');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-noagent-${Date.now()}@example.com`,
            name: 'Test User',
          },
          client: { type: 'individual' },
          agentHiring: {
            agentId: '507f1f77bcf86cd799439011',
            price: 100,
          },
          channels: [
            {
              name: channelName,
              type: 'web',
              agentChannelConfig: {
                channelConfig: {},
                llmConfig: { provider: 'openai', apiKey: 'key', model: 'gpt-4' },
              },
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toBe('Agent not found');
    });

    it('should return 400 when organization type has no name', async () => {
      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-org-${Date.now()}@example.com`,
            name: 'Test User',
          },
          client: { type: 'organization' },
          agentHiring: { agentId: testAgentId, price: 100 },
          channels: [],
        })
        .expect(400);

      expect(response.body.message).toBe(
        'Client name is required for organization type',
      );
    });

    describe('Validation errors', () => {
      it('should return 400 for invalid email', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'not-an-email', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: { agentId: testAgentId, price: 100 },
            channels: [],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('email')]),
        );
      });

      it('should return 400 for invalid client type', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'invalid-type' },
            agentHiring: { agentId: testAgentId, price: 100 },
            channels: [],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('type')]),
        );
      });

      it('should return 400 for invalid agentId format', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: { agentId: 'not-a-mongo-id', price: 100 },
            channels: [],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('agentId')]),
        );
      });

      it('should return 400 for negative price', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: { agentId: testAgentId, price: -1 },
            channels: [],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('price')]),
        );
      });

      it('should return 400 for invalid channel type', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: { agentId: testAgentId, price: 100 },
            channels: [
              {
                name: 'test-channel',
                type: 'invalid-channel-type',
                agentChannelConfig: {
                  channelConfig: {},
                  llmConfig: {
                    provider: 'openai',
                    apiKey: 'key',
                    model: 'gpt-4',
                  },
                },
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('type')]),
        );
      });

      it('should return 400 for invalid llm provider', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: { agentId: testAgentId, price: 100 },
            channels: [
              {
                name: 'test-channel',
                type: 'web',
                agentChannelConfig: {
                  channelConfig: {},
                  llmConfig: {
                    provider: 'invalid-provider',
                    apiKey: 'key',
                    model: 'gpt-4',
                  },
                },
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('provider')]),
        );
      });

      it('should return 400 for duplicate channel names in request', async () => {
        await provisionChannel('same-channel-name', 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: {
              email: `e2e-onboarding-dupch-${Date.now()}@example.com`,
              name: 'Test',
            },
            client: { type: 'individual' },
            agentHiring: { agentId: testAgentId, price: 100 },
            channels: [
              {
                name: 'same-channel-name',
                type: 'web',
                agentChannelConfig: {
                  channelConfig: {},
                  llmConfig: {
                    provider: 'openai',
                    apiKey: 'key',
                    model: 'gpt-4',
                  },
                },
              },
              {
                name: 'same-channel-name',
                type: 'api',
                agentChannelConfig: {
                  channelConfig: {},
                  llmConfig: {
                    provider: 'openai',
                    apiKey: 'key',
                    model: 'gpt-4',
                  },
                },
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toBe(
          'Duplicate channel names in request',
        );
      });
    });
  });
});
