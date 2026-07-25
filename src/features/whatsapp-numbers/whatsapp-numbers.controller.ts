import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { WhatsappNumbersService } from './whatsapp-numbers.service';
import { SearchNumbersDto } from './dto/search-numbers.dto';
import { ProvisionNumberDto } from './dto/provision-number.dto';
import { AssignNumberDto } from './dto/assign-number.dto';
import { ConfigureWebhookDto } from './dto/configure-webhook.dto';

/**
 * Admin ops API for platform-owned Twilio WhatsApp numbers.
 * Gated by the global RolesGuard (AuthorizationModule).
 */
@Controller('whatsapp-numbers')
export class WhatsappNumbersController {
  constructor(
    private readonly whatsappNumbersService: WhatsappNumbersService,
  ) {}

  @Roles('super_admin', 'support')
  @Get()
  listInventory() {
    return this.whatsappNumbersService.listInventory();
  }

  @Roles('super_admin', 'support')
  @Get('available')
  searchAvailable(@Query() query: SearchNumbersDto) {
    return this.whatsappNumbersService.searchAvailable(query);
  }

  @Roles('super_admin')
  @Post('provision')
  provision(@Body() dto: ProvisionNumberDto) {
    return this.whatsappNumbersService.provision(dto);
  }

  @Roles('super_admin')
  @Post('assign')
  assign(@Body() dto: AssignNumberDto) {
    return this.whatsappNumbersService.assign(dto);
  }

  @Roles('super_admin')
  @Post('configure-webhook')
  configureWebhook(@Body() dto: ConfigureWebhookDto) {
    return this.whatsappNumbersService.configureWebhook(dto.phoneNumber);
  }
}
