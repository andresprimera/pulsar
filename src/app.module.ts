import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { WhatsappModule } from './channels/whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [AppController],
})
export class AppModule {}
