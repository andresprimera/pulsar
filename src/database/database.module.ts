import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './schemas/client.schema';
import { Agent, AgentSchema } from './schemas/agent.schema';
import { Channel, ChannelSchema } from './schemas/channel.schema';
import { ClientAgent, ClientAgentSchema } from './schemas/client-agent.schema';
import {
  AgentChannel,
  AgentChannelSchema,
} from './schemas/agent-channel.schema';
import { ClientRepository } from './repositories/client.repository';
import { AgentRepository } from './repositories/agent.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { AgentChannelRepository } from './repositories/agent-channel.repository';
import { SeederService } from './seeder.service';

const repositories = [
  ClientRepository,
  AgentRepository,
  ChannelRepository,
  ClientAgentRepository,
  AgentChannelRepository,
];

@Global()
@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/pulsar',
    ),
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Agent.name, schema: AgentSchema },
      { name: Channel.name, schema: ChannelSchema },
      { name: ClientAgent.name, schema: ClientAgentSchema },
      { name: AgentChannel.name, schema: AgentChannelSchema },
    ]),
  ],
  providers: [...repositories, SeederService],
  exports: repositories,
})
export class DatabaseModule {}
