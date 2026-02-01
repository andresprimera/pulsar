import { Global, Module } from '@nestjs/common';
import { ClientRepository } from './repositories/client.repository';
import { AgentRepository } from './repositories/agent.repository';
import { ChannelRepository } from './repositories/channel.repository';
import { ClientAgentRepository } from './repositories/client-agent.repository';
import { AgentChannelRepository } from './repositories/agent-channel.repository';

const repositories = [
  ClientRepository,
  AgentRepository,
  ChannelRepository,
  ClientAgentRepository,
  AgentChannelRepository,
];

@Global()
@Module({
  providers: repositories,
  exports: repositories,
})
export class DatabaseModule {}
