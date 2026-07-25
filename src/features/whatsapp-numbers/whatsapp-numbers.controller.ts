import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { WhatsappNumbersService } from './whatsapp-numbers.service';
import { SearchNumbersDto } from './dto/search-numbers.dto';
import { ProvisionNumberDto } from './dto/provision-number.dto';
import { AssignNumberDto } from './dto/assign-number.dto';

@Controller('whatsapp-numbers')
export class WhatsappNumbersController {
  constructor(
    private readonly whatsappNumbersService: WhatsappNumbersService,
  ) {}

  @Get()
  listInventory() {
    return this.whatsappNumbersService.listInventory();
  }

  @Get('available')
  searchAvailable(@Query() query: SearchNumbersDto) {
    return this.whatsappNumbersService.searchAvailable(query);
  }

  @Post('provision')
  provision(@Body() dto: ProvisionNumberDto) {
    return this.whatsappNumbersService.provision(dto);
  }

  @Post('assign')
  assign(@Body() dto: AssignNumberDto) {
    return this.whatsappNumbersService.assign(dto);
  }
}
