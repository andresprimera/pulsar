import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Headers,
  Req,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ChannelProvider } from '@domain/channels/channel-provider.enum';
import { ChannelProviderValue } from '@shared/channel-provider.constants';
import { ChannelEnvService } from '@channels/config/channel-env.service';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppProviderRouter } from './provider-router';
import { Public } from '@shared/decorators/public.decorator';

@Public()
@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsAppChannelService: WhatsAppChannelService,
    private readonly providerRouter: WhatsAppProviderRouter,
    private readonly channelEnvService: ChannelEnvService,
  ) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.whatsAppChannelService.verifyMetaWebhook(
      mode,
      token,
      challenge,
    );
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() payload: unknown): Promise<string> {
    this.logger.log(`Incoming WhatsApp webhook (${ChannelProvider.Meta})`);
    try {
      await this.whatsAppChannelService.handleIncoming(
        payload,
        ChannelProvider.Meta,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process WhatsApp webhook (${ChannelProvider.Meta}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    return 'ok';
  }

  @Post('webhook/:provider')
  @HttpCode(200)
  async handleProviderWebhook(
    @Body() payload: unknown,
    @Param('provider') provider: string,
    @Headers('x-twilio-signature') twilioSignature?: string,
    @Req() request?: Request,
  ): Promise<string> {
    if (!this.providerRouter.hasAdapter(provider)) {
      throw new BadRequestException(
        `Unsupported WhatsApp provider: ${provider}`,
      );
    }

    this.whatsAppChannelService.verifyInboundSignature(
      provider as ChannelProviderValue,
      {
        url: this.resolveWebhookUrl(request),
        signature: twilioSignature,
        payload,
      },
    );

    this.logger.log(`Incoming WhatsApp webhook (${provider})`);
    try {
      await this.whatsAppChannelService.handleIncoming(
        payload,
        provider as any,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process WhatsApp webhook (${provider}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    return 'ok';
  }

  /**
   * Signature schemes sign the exact public URL Twilio was configured with, which
   * proxied request headers cannot be trusted to reproduce. PUBLIC_BASE_URL wins
   * when set; otherwise fall back to the request's own view of itself.
   */
  private resolveWebhookUrl(request?: Request): string {
    const path = request?.originalUrl ?? '';
    const configuredBaseUrl = this.channelEnvService.getPublicBaseUrl();
    if (configuredBaseUrl) {
      return configuredBaseUrl + path;
    }
    return `${request?.protocol ?? 'https'}://${
      request?.get('host') ?? ''
    }${path}`;
  }
}
