import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientRepository } from './repositories/client.repository';
import { AgentRepository } from './repositories/agent.repository';
import { UserRepository } from './repositories/user.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { AgentChannelRepository } from './repositories/agent-channel.repository';
import { ClientPhoneRepository } from './repositories/client-phone.repository';
import { Agent } from './schemas/agent.schema';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly agentRepository: AgentRepository,
    private readonly userRepository: UserRepository,
    private readonly clientAgentRepository: ClientAgentRepository,
    private readonly channelRepository: ChannelRepository,
    private readonly agentChannelRepository: AgentChannelRepository,
    private readonly clientPhoneRepository: ClientPhoneRepository,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
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
      // 1. Client
      let client = (await this.clientRepository.findAll()).find(c => c.name === 'Acme Corp');
      if (!client) {
        this.logger.log('Creating Client: Acme Corp');
        client = await this.clientRepository.create({
          name: 'Acme Corp',
          status: 'active',
        });
      } else {
        this.logger.log(`Client "Acme Corp" already exists (${client._id})`);
      }

      // 2. Agent
      let agent: any = await this.agentModel.findOne({ name: 'Support Bot' }).exec();
      
      if (!agent) {
        this.logger.log('Creating Agent: Support Bot');
        agent = await this.agentRepository.create({
          name: 'Support Bot',
          systemPrompt: 'You are a helpful support assistant.',
          status: 'active',
          createdBySeeder: true,
        });
      } else {
        this.logger.log(`Agent "Support Bot" already exists (${agent._id})`);
      }

      // 3. User
      const userEmail = 'john.doe@pulsar.com';
      let user = await this.userRepository.findByEmail(userEmail);
      if (!user) {
        this.logger.log(`Creating User: ${userEmail}`);
        user = await this.userRepository.create({
          name: 'John Doe',
          email: userEmail,
          clientId: client._id as Types.ObjectId, // cast if needed based on repo types
          status: 'active',
        });
      } else {
        this.logger.log(`User "${userEmail}" already exists (${user._id})`);
      }

      // 4. ClientAgent
      const clientAgents = await this.clientAgentRepository.findByClient(client._id as string);
      let clientAgent = clientAgents.find(ca => ca.agentId.toString() === agent._id.toString());
      
      if (!clientAgent) {
        this.logger.log('Creating ClientAgent link');
        clientAgent = await this.clientAgentRepository.create({
          clientId: client._id as string,
          agentId: agent._id as string,
          status: 'active',
          price: 100,
        });
      } else {
        this.logger.log(`ClientAgent link already exists (${clientAgent._id})`);
      }

      // 5. Channel (WhatsApp)
      const channel = await this.channelRepository.findOrCreateByName('WhatsApp', {
        name: 'WhatsApp',
        type: 'whatsapp',
        provider: 'meta',
      });
      this.logger.log(`Ensure Channel: WhatsApp (${channel._id})`);

      // 6. ClientPhone (Phone number ownership)
      const clientPhone = await this.clientPhoneRepository.resolveOrCreate(
        client._id as Types.ObjectId,
        '1234567890',
        { provider: 'meta' },
      );
      this.logger.log(`Ensure ClientPhone: 1234567890 (${clientPhone._id})`);

      // 7. AgentChannel (WhatsApp Link)
      const agentChannel = await this.agentChannelRepository.findOrCreate({
          agentId: agent._id as string,
          clientId: client._id as string,
          channelId: channel._id as string,
          status: 'active',
          clientPhoneId: clientPhone._id as Types.ObjectId,
          channelConfig: {
            accessToken: '__REPLACE_ME_ACCESS_TOKEN__',
            webhookVerifyToken: '__REPLACE_ME_VERIFY_TOKEN__',
          },
          llmConfig: {
            provider: 'openai',
            apiKey: '__REPLACE_ME_API_KEY__',
            model: 'gpt-4o',
          },
      });
      this.logger.log(`Ensure AgentChannel: WhatsApp (${agentChannel._id})`);

      this.logger.log('Seeding complete.');
    } catch (error) {
      this.logger.error('Seeding failed', error);
    }
  }
}
