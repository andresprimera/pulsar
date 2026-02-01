import { Module } from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { ClientAgentsController } from './client-agents.controller';
import { DatabaseModule } from '../database/database.module';
import { ClientsModule } from '../clients/clients.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [DatabaseModule, ClientsModule, AgentsModule],
  controllers: [ClientAgentsController],
  providers: [ClientAgentsService],
})
export class ClientAgentsModule {}
