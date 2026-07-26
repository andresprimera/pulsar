import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validate';
import { AppController } from './app.controller';
import { DatabaseModule } from './core/persistence/database.module';
import { WhatsappModule } from './core/channels/whatsapp/whatsapp.module';
import { MessagingGatewayModule } from './core/channels/gateway/messaging-gateway.module';
import { TiktokModule } from './core/channels/tiktok/tiktok.module';
import { InstagramModule } from './core/channels/instagram/instagram.module';
import { TelegramModule } from './core/channels/telegram/telegram.module';
import { AgentsModule } from './features/agents/agents.module';
import { AgentPricesModule } from './features/agent-prices/agent-prices.module';
import { ChannelPricesModule } from './features/channel-prices/channel-prices.module';
import { ChannelsModule } from './features/channels/channels.module';
import { UsersModule } from './features/users/users.module';
import { ClientsModule } from './features/clients/clients.module';
import { ClientAgentsModule } from './features/client-agents/client-agents.module';
import { OnboardingModule } from './features/onboarding/onboarding.module';
import { PersonalitiesModule } from './features/personalities/personalities.module';
import { ClientContextSuggestionsModule } from './features/client-context-suggestions/client-context-suggestions.module';
import { ClientCatalogItemsModule } from './features/client-catalog-items/client-catalog-items.module';
import { AdminAuthModule } from './features/admin-auth/admin-auth.module';
import { ClientAuthModule } from './features/client-auth/client-auth.module';
import { AuthorizationModule } from './features/authorization/authorization.module';
import { InboxModule } from './features/inbox/inbox.module';
import { WhatsappNumbersModule } from './features/whatsapp-numbers/whatsapp-numbers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    WhatsappModule,
    MessagingGatewayModule,
    TiktokModule,
    InstagramModule,
    TelegramModule,
    AgentsModule,
    AgentPricesModule,
    ChannelPricesModule,
    ChannelsModule,
    UsersModule,
    ClientsModule,
    ClientAgentsModule,
    PersonalitiesModule,
    ClientContextSuggestionsModule,
    ClientCatalogItemsModule,
    OnboardingModule,
    AdminAuthModule,
    ClientAuthModule,
    AuthorizationModule,
    InboxModule,
    WhatsappNumbersModule,
  ],

  controllers: [AppController],
})
export class AppModule {}
