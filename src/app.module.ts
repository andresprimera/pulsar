import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { WhatsappModule } from './channels/whatsapp/whatsapp.module';
import { AgentsModule } from './agents/agents.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [DatabaseModule, WhatsappModule, AgentsModule, UsersModule],

  controllers: [AppController],
})
export class AppModule {}
