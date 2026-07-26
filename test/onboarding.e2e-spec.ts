import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { loginAsTestAdmin, AdminTestAuth } from './helpers/admin-test-auth';
import { ensureIndexes } from './helpers/ensure-indexes';

describe('Onboarding (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let testAgentId: string;
  let testPersonalityId: string;
  let adminAuth: AdminTestAuth;

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
      await connection.collection('client_agents').deleteMany({
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
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    connection = moduleFixture.get<Connection>(getConnectionToken());
    // Mongoose autoIndex is async; wait so onboarding transactions do not race
    // catalog changes ("Unable to write … due to catalog changes").
    await ensureIndexes(connection);

    adminAuth = await loginAsTestAdmin(app, connection);

    try {
      // Remove potential zombie index from previous schema versions
      await connection
        .collection('agent_channels')
        .dropIndex('channelConfig.phoneNumberId_1');
    } catch (e) {
      // Ignore if index doesn't exist
    }

    await cleanup();

    // Create a test agent for hiring
    const agentResponse = await request(app.getHttpServer())
      .post('/agents')
      .set('Cookie', adminAuth.cookie)
      .send({
        name: 'E2E Onboarding Test Agent',
        systemPrompt: 'You are a test assistant for onboarding.',
        kind: 'customer_service',
      });

    testAgentId = agentResponse.body._id;

    // Ensure catalog price exists for onboarding (USD)
    await request(app.getHttpServer())
      .put(`/agents/${testAgentId}/prices/USD`)
      .set('Cookie', adminAuth.cookie)
      .send({ amount: 0 })
      .expect(200);

    // Get or create a personality for agentHiring (required)
    const personality = await connection
      .collection('personalities')
      .findOne({ status: 'active' });
    if (!personality) {
      const inserted = await connection.collection('personalities').insertOne({
        name: 'E2E Onboarding Default',
        description: 'E2E test personality',
        promptTemplate: 'Be helpful.',
        status: 'active',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testPersonalityId = inserted.insertedId.toString();
    } else {
      testPersonalityId = (personality._id as Types.ObjectId).toString();
    }
  });

  afterAll(async () => {
    await cleanup();
    await adminAuth.cleanup();
    await app.close();
  });

  async function provisionChannel(name: string, type: string) {
    // For WhatsApp, use 'meta'. For all other test channel types, use 'instagram'.
    const provider = type === 'whatsapp' ? 'meta' : 'instagram';
    const supportedProviders = [provider];

    const result = await connection.collection('channels').findOneAndUpdate(
      { name },
      {
        $set: {
          name,
          type,
          provider,
          supportedProviders,
          isSystem: false,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    const channelId = result.value
      ? result.value._id.toString()
      : result.lastErrorObject.upserted.toString();

    // Ensure catalog price exists for onboarding (USD)
    await request(app.getHttpServer())
      .put(`/channels/${channelId}/prices/USD`)
      .set('Cookie', adminAuth.cookie)
      .send({ amount: 0 })
      .expect(200);

    return channelId;
  }

  describe('POST /onboarding/company-brief/suggest', () => {
    it('should return 400 when OPENAI_API_KEY is unset', async () => {
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await request(app.getHttpServer())
        .post('/onboarding/company-brief/suggest')
        .field('instructions', 'Hello')
        .expect(400);

      process.env.OPENAI_API_KEY = prev;
    });
  });

  describe('POST /onboarding/prompt-supplement/suggest', () => {
    it('should return 400 when OPENAI_API_KEY is unset', async () => {
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await request(app.getHttpServer())
        .post('/onboarding/prompt-supplement/suggest')
        .field('instructions', 'Hello')
        .expect(400);

      process.env.OPENAI_API_KEY = prev;
    });
  });

  describe('POST /clients/context-suggestions/company-brief/suggest', () => {
    it('should return 400 when OPENAI_API_KEY is unset', async () => {
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await request(app.getHttpServer())
        .post('/clients/context-suggestions/company-brief/suggest')
        .set('Cookie', adminAuth.cookie)
        .field('instructions', 'Hello')
        .expect(400);

      process.env.OPENAI_API_KEY = prev;
    });
  });

  describe('POST /clients/context-suggestions/prompt-supplement/suggest', () => {
    it('should return 400 when OPENAI_API_KEY is unset', async () => {
      const prev = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      await request(app.getHttpServer())
        .post('/clients/context-suggestions/prompt-supplement/suggest')
        .set('Cookie', adminAuth.cookie)
        .field('instructions', 'Hello')
        .expect(400);

      process.env.OPENAI_API_KEY = prev;
    });
  });

  describe('POST /onboarding/register-and-hire', () => {
    it('should complete full registration flow for individual client', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uniqueEmail = `e2e-onboarding-test-${suffix}@example.com`;

      const channelName = `e2e-test-channel-${suffix}`;
      const channelId = await provisionChannel(channelName, 'whatsapp');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: uniqueEmail,
            name: 'E2E Onboarding Test User',
          },
          client: {
            type: 'individual',
            companyBrief: 'E2E org-wide context line.',
            llmConfig: {
              provider: 'openai',
              apiKey: 'test-key',
              model: 'gpt-4',
            },
          },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            pricingOverride: { agentAmount: 99.99 },
            promptSupplement: 'E2E hire supplement line.',
          },
          channels: [
            {
              channelId,
              provider: 'meta',
              credentials: {
                phoneNumberId: `e2e-phone-${suffix}`,
                accessToken: 'test-token',
                webhookVerifyToken: 'test-verify',
              },
              amountOverride: 0,
            },
          ],
        })
        .expect(201);

      // Verify response structure
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('client');
      expect(response.body).toHaveProperty('clientAgent');

      // Verify user
      expect(response.body.user.email).toBe(uniqueEmail.toLowerCase());
      expect(response.body.user.name).toBe('E2E Onboarding Test User');
      expect(response.body.user.status).toBe('active');

      // Verify client
      expect(response.body.client.type).toBe('individual');
      expect(response.body.client.name).toBe('E2E Onboarding Test User');
      expect(response.body.client.status).toBe('active');
      expect(response.body.client.companyBrief).toBe(
        'E2E org-wide context line.',
      );

      // Verify clientAgent
      expect(response.body.clientAgent.clientId).toBe(response.body.client._id);
      expect(response.body.clientAgent.agentId).toBe(testAgentId);
      expect(response.body.clientAgent.agentPricing.amount).toBe(99.99);
      expect(response.body.clientAgent.agentPricing.currency).toBeDefined();
      expect(response.body.clientAgent.promptSupplement).toBe(
        'E2E hire supplement line.',
      );

      const savedClient = await connection
        .collection('clients')
        .findOne({ _id: new Types.ObjectId(response.body.client._id) });
      expect(savedClient?.companyBrief).toBe('E2E org-wide context line.');

      // Verify agentChannels in DB
      const savedClientAgent = await connection
        .collection('client_agents')
        .findOne({ _id: new Types.ObjectId(response.body.clientAgent._id) });

      expect(savedClientAgent).toBeDefined();
      expect(savedClientAgent?.promptSupplement).toBe(
        'E2E hire supplement line.',
      );

      expect(savedClientAgent.channels).toHaveLength(1);
      expect(savedClientAgent.channels[0].channelId.toString()).toBe(channelId);
      expect(savedClientAgent.channels[0].provider).toBe('meta');
      expect(savedClientAgent.channels[0].credentials).toBeDefined();
      // LLM config is per-client only; channels no longer have llmConfig
      expect(savedClientAgent.channels[0].llmConfig).toBeUndefined();

      // EDGE-3: Verify that GET /client-agents excludes credentials (select: false)
      const listResponse = await request(app.getHttpServer())
        .get(`/client-agents/client/${response.body.client._id}`)
        .set('Cookie', adminAuth.cookie)
        .expect(200);

      expect(listResponse.body).toHaveLength(1);
      // Credentials should NOT be present in the list response; channels have no llmConfig
      const listedChannels = listResponse.body[0].channels;
      if (listedChannels && listedChannels.length > 0) {
        expect(listedChannels[0].credentials).toBeUndefined();
      }
      // GET client-agents response channels must not include llmConfig
      listResponse.body.forEach(
        (ca: { channels?: Array<{ llmConfig?: unknown }> }) => {
          ca.channels?.forEach((ch) => {
            expect(ch.llmConfig).toBeUndefined();
          });
        },
      );
    });

    it('should complete registration with platform-hosted WhatsApp (no provider or routing)', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uniqueEmail = `e2e-onboarding-platform-${suffix}@example.com`;
      const channelName = `e2e-test-channel-platform-${suffix}`;
      const channelId = await provisionChannel(channelName, 'whatsapp');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: { email: uniqueEmail, name: 'E2E Platform Hosted User' },
          client: { type: 'individual' },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            pricingOverride: { agentAmount: 0 },
          },
          channels: [{ channelId, platformHosted: true }],
        })
        .expect(201);

      const savedClientAgent = await connection
        .collection('client_agents')
        .findOne({ _id: new Types.ObjectId(response.body.clientAgent._id) });
      expect(savedClientAgent?.channels).toHaveLength(1);
      expect(savedClientAgent?.channels[0].channelId.toString()).toBe(
        channelId,
      );
      expect(savedClientAgent?.channels[0].provider).toBe('meta');
      expect(savedClientAgent?.channels[0].phoneNumberId).toBeUndefined();
    });

    it('should use explicit client name when provided', async () => {
      const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const uniqueEmail = `e2e-onboarding-test-${suffix}@example.com`;

      const channelName = `e2e-test-channel-${suffix}`;
      const channelId = await provisionChannel(channelName, 'web');

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
            personalityId: testPersonalityId,
            price: 199.99,
          },
          channels: [
            {
              channelId,
              provider: 'instagram',
              credentials: {},
            },
          ],
        })
        .expect(201);

      expect(response.body.client.name).toBe(
        `E2E Onboarding Custom Org Name ${suffix}`,
      );
      expect(response.body.client.type).toBe('organization');
    });

    it('should normalize email to lowercase and trim', async () => {
      const uniqueSuffix = Date.now();

      const channelName = `e2e-test-channel-${uniqueSuffix}`;
      const channelId = await provisionChannel(channelName, 'api');

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
            personalityId: testPersonalityId,
            price: 50,
          },
          channels: [
            {
              channelId,
              provider: 'instagram',
              credentials: {},
            },
          ],
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
      const channelId1 = await provisionChannel(channelName1, 'web');

      // First registration
      await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: { email: uniqueEmail, name: 'First User' },
          client: { type: 'individual' },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId: channelId1,
              provider: 'instagram',
              credentials: {},
            },
          ],
        })
        .expect(201);

      const channelName2 = `e2e-test-channel-dup-2-${suffix}`;
      const channelId2 = await provisionChannel(channelName2, 'web');

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: { email: uniqueEmail, name: 'Second User' },
          client: { type: 'individual' },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId: channelId2,
              provider: 'instagram',
              credentials: {},
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
      const channelId1 = await provisionChannel(channelName1, 'whatsapp');

      // First registration
      await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-test-phone1-${suffix}@example.com`,
            name: 'First User',
          },
          client: { type: 'individual' },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId: channelId1,
              provider: 'meta',
              credentials: {
                phoneNumberId,
                accessToken: 'token',
                webhookVerifyToken: 'verify',
              },
            },
          ],
        })
        .expect(201);

      const channelName2 = `e2e-test-channel-phone2-${suffix}`;
      const channelId2 = await provisionChannel(channelName2, 'whatsapp');

      // Second registration with same phoneNumberId (different client)
      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-test-phone2-${suffix}@example.com`,
            name: 'Second User',
          },
          client: { type: 'individual' },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId: channelId2,
              provider: 'meta',
              credentials: {
                phoneNumberId,
                accessToken: 'token2',
                webhookVerifyToken: 'verify2',
              },
            },
          ],
        })
        .expect(409);

      expect(response.body.message).toContain(
        'already owned by another client',
      );
    });

    it('should return 400 when agent is not hireable (inactive)', async () => {
      // Create and deactivate an agent
      const inactiveAgentResponse = await request(app.getHttpServer())
        .post('/agents')
        .set('Cookie', adminAuth.cookie)
        .send({
          name: 'E2E Onboarding Inactive Agent',
          systemPrompt: 'Test',
          kind: 'customer_service',
        });

      await request(app.getHttpServer())
        .patch(`/agents/${inactiveAgentResponse.body._id}/status`)
        .set('Cookie', adminAuth.cookie)
        .send({ status: 'inactive' });

      const channelName = `e2e-test-channel-inactive-${Date.now()}`;
      const channelId = await provisionChannel(channelName, 'web');

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
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId,
              provider: 'instagram',
              credentials: {},
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toBe('Agent is not currently available');
    });

    it('should return 400 when agent does not exist', async () => {
      const channelName = `e2e-test-channel-noagent-${Date.now()}`;
      const channelId = await provisionChannel(channelName, 'web');

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
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId,
              provider: 'instagram',
              credentials: {},
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toBe('Agent not found');
    });

    it('should return 400 when organization type has no name', async () => {
      const channelName = `e2e-test-channel-org-${Date.now()}`;
      const channelId = await provisionChannel(channelName, 'web');

      const response = await request(app.getHttpServer())
        .post('/onboarding/register-and-hire')
        .send({
          user: {
            email: `e2e-onboarding-org-${Date.now()}@example.com`,
            name: 'Test User',
          },
          client: { type: 'organization' },
          agentHiring: {
            agentId: testAgentId,
            personalityId: testPersonalityId,
            price: 100,
          },
          channels: [
            {
              channelId,
              provider: 'instagram',
              credentials: {},
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toBe(
        'Client name is required for organization type',
      );
    });

    describe('Validation errors', () => {
      it('should return 400 for invalid email', async () => {
        const channelName = `e2e-test-channel-inv-email-${Date.now()}`;
        const channelId = await provisionChannel(channelName, 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'not-an-email', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [
              {
                channelId,
                provider: 'instagram',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('email')]),
        );
      });

      it('should return 400 for invalid client type', async () => {
        const channelName = `e2e-test-channel-inv-client-${Date.now()}`;
        const channelId = await provisionChannel(channelName, 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'invalid-type' },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [
              {
                channelId,
                provider: 'instagram',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('type')]),
        );
      });

      it('should return 400 for invalid agentId format', async () => {
        const channelName = `e2e-test-channel-inv-agent-${Date.now()}`;
        const channelId = await provisionChannel(channelName, 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: {
              agentId: 'not-a-mongo-id',
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [
              {
                channelId,
                provider: 'instagram',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('agentId')]),
        );
      });

      it('should return 400 for negative price', async () => {
        const channelName = `e2e-test-channel-neg-price-${Date.now()}`;
        const channelId = await provisionChannel(channelName, 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              pricingOverride: { agentAmount: -1 },
            },
            channels: [
              {
                channelId,
                provider: 'instagram',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringMatching(/price|amount/i)]),
        );
      });

      it('should return 400 for invalid channel provider', async () => {
        const channelName = `e2e-test-channel-${Date.now()}`;
        const channelId = await provisionChannel(channelName, 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [
              {
                channelId,
                provider: 'invalid-provider',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('provider')]),
        );
      });

      it('should return 400 for invalid llm provider', async () => {
        const channelName = `e2e-test-channel-llm-${Date.now()}`;
        const channelId = await provisionChannel(channelName, 'web');
        const uniqueEmail = `e2e-onboarding-llm-invalid-${Date.now()}@example.com`;

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: uniqueEmail, name: 'Test' },
            client: {
              type: 'individual',
              llmConfig: {
                provider: 'invalid-provider',
                apiKey: 'key',
                model: 'gpt-4',
              },
            },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [
              {
                channelId,
                provider: 'instagram',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('provider')]),
        );
      });

      // New validation test: Missing channels
      it('should return 400 when no channels provided', async () => {
        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            client: { type: 'individual' },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [],
          })
          .expect(400);

        expect(response.body.message).toEqual(
          expect.arrayContaining([expect.stringContaining('channels')]),
        );
      });

      it('should return 400 for duplicate channel IDs in request', async () => {
        const channelName = 'dup-channel-test';
        const channelId = await provisionChannel(channelName, 'web');

        const response = await request(app.getHttpServer())
          .post('/onboarding/register-and-hire')
          .send({
            user: {
              email: `e2e-onboarding-dupch-${Date.now()}@example.com`,
              name: 'Test',
            },
            client: { type: 'individual' },
            agentHiring: {
              agentId: testAgentId,
              personalityId: testPersonalityId,
              price: 100,
            },
            channels: [
              {
                channelId,
                provider: 'instagram',
                credentials: {},
              },
              {
                channelId, // Same ID
                provider: 'instagram',
                credentials: {},
              },
            ],
          })
          .expect(400);

        expect(response.body.message).toContain(
          'Duplicate channelId in request',
        );
      });
    });
  });
});
