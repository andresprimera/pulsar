import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { ClientAgentsService } from './client-agents.service';
import { CreateClientAgentDto } from './dto/create-client-agent.dto';
import { UpdateClientAgentDto } from './dto/update-client-agent.dto';
import { UpdateClientAgentStatusDto } from './dto/update-client-agent-status.dto';

@Controller('client-agents')
export class ClientAgentsController {
  constructor(private readonly clientAgentsService: ClientAgentsService) {}

  @Post()
  create(@Body() createDto: CreateClientAgentDto) {
    return this.clientAgentsService.create(createDto);
  }

  @Get('client/:clientId')
  findByClient(@Param('clientId') clientId: string) {
    return this.clientAgentsService.findByClient(clientId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateClientAgentDto) {
    return this.clientAgentsService.update(id, updateDto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() updateDto: UpdateClientAgentStatusDto) {
    return this.clientAgentsService.updateStatus(id, updateDto);
  }

  // Modified route to match controller structure
  @Get('billing/client/:clientId')
  calculateClientTotal(@Param('clientId') clientId: string) {
    return this.clientAgentsService.calculateClientTotal(clientId);
  }
}
