import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { WhatsappModule } from './channels/whatsapp/whatsapp.module';
import { AgentsModule } from './agents/agents.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';

import { ClientAgentsModule } from './client-agents/client-agents.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    WhatsappModule,
    AgentsModule,
    UsersModule,
    ClientsModule,
    ClientAgentsModule,
    OnboardingModule,
  ],


  controllers: [AppController],
})
export class AppModule {}
