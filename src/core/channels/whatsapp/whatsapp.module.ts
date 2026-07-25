import { Module } from '@nestjs/common';
import { OrchestratorModule } from '@orchestrator/orchestrator.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppProviderRouter } from './provider-router';
import { MetaWhatsAppAdapter } from './providers/meta.adapter';
import { Dialog360WhatsAppAdapter } from './providers/dialog360.adapter';
import { TwilioWhatsAppAdapter } from './providers/twilio.adapter';
import { TwilioNumberProvisioningService } from './providers/twilio-provisioning.service';

@Module({
  imports: [OrchestratorModule],
  controllers: [WhatsappController],
  providers: [
    MetaWhatsAppAdapter,
    Dialog360WhatsAppAdapter,
    TwilioWhatsAppAdapter,
    TwilioNumberProvisioningService,
    WhatsAppProviderRouter,
    WhatsAppChannelService,
  ],
  exports: [WhatsAppChannelService, TwilioNumberProvisioningService],
})
export class WhatsappModule {}
