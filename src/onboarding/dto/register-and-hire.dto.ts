import {
  IsString,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class UserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;
}

class ClientDto {
  @IsEnum(['individual', 'organization'])
  type: 'individual' | 'organization';

  @IsOptional()
  @IsString()
  name?: string;
}

class AgentHiringDto {
  @IsMongoId()
  agentId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}

class LlmConfigDto {
  @IsEnum(['openai', 'anthropic'])
  provider: 'openai' | 'anthropic';

  @IsString()
  apiKey: string;

  @IsString()
  model: string;
}

class AgentChannelConfigDto {
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsObject()
  channelConfig: Record<string, any>;

  @ValidateNested()
  @Type(() => LlmConfigDto)
  llmConfig: LlmConfigDto;
}

class ChannelDto {
  @IsString()
  name: string;

  @IsEnum(['whatsapp', 'telegram', 'web', 'api'])
  type: 'whatsapp' | 'telegram' | 'web' | 'api';

  @IsOptional()
  @IsEnum(['meta', 'twilio', 'custom'])
  provider?: 'meta' | 'twilio' | 'custom';

  @ValidateNested()
  @Type(() => AgentChannelConfigDto)
  agentChannelConfig: AgentChannelConfigDto;
}

export class RegisterAndHireDto {
  @ValidateNested()
  @Type(() => UserDto)
  user: UserDto;

  @ValidateNested()
  @Type(() => ClientDto)
  client: ClientDto;

  @ValidateNested()
  @Type(() => AgentHiringDto)
  agentHiring: AgentHiringDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelDto)
  channels: ChannelDto[];
}
