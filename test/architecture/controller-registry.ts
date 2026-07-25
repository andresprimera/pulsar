import type { Type } from '@nestjs/common';

import { AdminAuthController } from '../../src/features/admin-auth/admin-auth.controller';
import { ClientAuthController } from '../../src/features/client-auth/client-auth.controller';
import { ClientAgentsController } from '../../src/features/client-agents/client-agents.controller';
import { ClientAgentsClientController } from '../../src/features/client-agents/client-agents.client.controller';
import { ClientCatalogItemsController } from '../../src/features/client-catalog-items/client-catalog-items.controller';
import { ClientContextSuggestionsController } from '../../src/features/client-context-suggestions/client-context-suggestions.controller';
import { ClientsController } from '../../src/features/clients/clients.controller';
import { UsersController } from '../../src/features/users/users.controller';
import { AgentsController } from '../../src/features/agents/agents.controller';
import { AgentPricesController } from '../../src/features/agent-prices/agent-prices.controller';
import { ChannelsController } from '../../src/features/channels/channels.controller';
import { ChannelPricesController } from '../../src/features/channel-prices/channel-prices.controller';
import { PersonalitiesController } from '../../src/features/personalities/personalities.controller';
import { OnboardingController } from '../../src/features/onboarding/onboarding.controller';
import { InboxController } from '../../src/features/inbox/inbox.client.controller';
import { WhatsappNumbersController } from '../../src/features/whatsapp-numbers/whatsapp-numbers.controller';

import { WhatsappController } from '../../src/core/channels/whatsapp/whatsapp.controller';
import { TelegramController } from '../../src/core/channels/telegram/telegram.controller';
import { TiktokController } from '../../src/core/channels/tiktok/tiktok.controller';
import { InstagramController } from '../../src/core/channels/instagram/instagram.controller';

/**
 * Hand-maintained registry of every controller class in the codebase.
 * Architecture tests walk this list via `Reflect.getMetadata` to enforce
 * decorator invariants without bootstrapping a Nest application context.
 *
 * The companion test (clientid-routes-have-owns-client) includes a count
 * check that scans the src tree for *.controller.ts files (excluding
 * app.controller.ts) and fails CI if the count differs from this array's
 * length. A new controller MUST be added here at the same time it is
 * added to its module.
 */
export const CONTROLLER_REGISTRY: ReadonlyArray<Type<unknown>> = [
  AdminAuthController,
  ClientAuthController,
  ClientAgentsController,
  ClientAgentsClientController,
  ClientCatalogItemsController,
  ClientContextSuggestionsController,
  ClientsController,
  UsersController,
  AgentsController,
  AgentPricesController,
  ChannelsController,
  ChannelPricesController,
  PersonalitiesController,
  OnboardingController,
  InboxController,
  WhatsappNumbersController,
  WhatsappController,
  TelegramController,
  TiktokController,
  InstagramController,
];
