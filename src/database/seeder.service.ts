import { Injectable, OnApplicationBootstrap, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRepository } from './repositories/user.repository';
import { Agent } from './schemas/agent.schema';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ChannelRepository } from './repositories/channel.repository';

const SEED_USER_EMAIL = 'john.doe@pulsar.com';
const SEED_AGENT_NAME = 'Support Bot';
const SEED_PHONE_NUMBER_ID = '1234567890';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly userRepository: UserRepository,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboardingService: OnboardingService,
    private readonly channelRepository: ChannelRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pulsar';
    this.logger.log(`Connected to Database: ${uri.replace(/:([^:@]+)@/, ':****@')}`);

    const isProd = process.env.NODE_ENV === 'production';
    const startSeed = isProd
      ? process.env.SEED_DB === 'true' // Prod: Must be explicit
      : process.env.SEED_DB !== 'false'; // Dev: Default on, explicit off

    if (!startSeed) {
      this.logger.log(`Skipping seeding (NODE_ENV=${process.env.NODE_ENV}, SEED_DB=${process.env.SEED_DB})`);
      return;
    }

    await this.seed();
  }

  private async seed(): Promise<void> {
    this.logger.log('Starting database seed...');

    try {
      // Idempotency check: if seed user exists, skip entire seeding
      const existingUser = await this.userRepository.findByEmail(SEED_USER_EMAIL);
      if (existingUser) {
        this.logger.log(`Seed user "${SEED_USER_EMAIL}" already exists. Skipping seeding.`);
        return;
      }

      // 1. Ensure Agent exists (required for onboarding)
      let agent = await this.agentModel.findOne({ name: SEED_AGENT_NAME }).exec();
      if (!agent) {
        this.logger.log(`Creating Agent: ${SEED_AGENT_NAME}`);
        agent = await this.agentModel.create({
          name: SEED_AGENT_NAME,
          systemPrompt: 'You are a helpful support assistant.',
          status: 'active',
          createdBySeeder: true,
        });
      } else {
        this.logger.log(`Agent "${SEED_AGENT_NAME}" already exists (${agent._id})`);
      }

      // 2. Ensure Channels exist (Infrastructure provisioning)
      this.logger.log('Provisioning channels...');
      await this.channelRepository.findOrCreateByName('WhatsApp', {
        type: 'whatsapp',
        provider: 'meta',
      });

      // 3. Use OnboardingService to create User, Client, ClientAgent, AgentChannel, ClientPhone
      this.logger.log('Running onboarding flow for seed user...');
      const result = await this.onboardingService.registerAndHire({
        user: {
          email: SEED_USER_EMAIL,
          name: 'John Doe',
        },
        client: {
          type: 'individual',
        },
        agentHiring: {
          agentId: agent._id.toString(),
          price: 100,
        },
        channels: [
          {
            name: 'WhatsApp',
            type: 'whatsapp',
            provider: 'meta',
            agentChannelConfig: {
              status: 'active',
              channelConfig: {
                phoneNumberId: SEED_PHONE_NUMBER_ID,
                accessToken: '__REPLACE_ME_ACCESS_TOKEN__',
                webhookVerifyToken: '__REPLACE_ME_VERIFY_TOKEN__',
              },
              llmConfig: {
                provider: 'openai',
                apiKey: '__REPLACE_ME_API_KEY__',
                model: 'gpt-4o',
              },
            },
          },
        ],
      });

      this.logger.log(`Seeding complete via onboarding:`);
      this.logger.log(`  - User: ${result.user._id} (${result.user.email})`);
      this.logger.log(`  - Client: ${result.client._id} (${result.client.name})`);
      this.logger.log(`  - ClientAgent: ${result.clientAgent._id}`);
      this.logger.log(`  - AgentChannels: ${result.agentChannels.map(ac => ac._id).join(', ')}`);
    } catch (error) {
      this.logger.error('Seeding failed', error);
    }
  }
}
