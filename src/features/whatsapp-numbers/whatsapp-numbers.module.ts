import { Module } from '@nestjs/common';
import { DatabaseModule } from '@persistence/database.module';
import { WhatsappModule } from '@channels/whatsapp/whatsapp.module';
import { WhatsappNumbersController } from './whatsapp-numbers.controller';
import { WhatsappNumbersService } from './whatsapp-numbers.service';

@Module({
  imports: [DatabaseModule, WhatsappModule],
  controllers: [WhatsappNumbersController],
  providers: [WhatsappNumbersService],
})
export class WhatsappNumbersModule {}
