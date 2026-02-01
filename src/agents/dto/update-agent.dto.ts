import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LlmOverrideDto {
  @IsString()
  provider: string;

  @IsString()
  model: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LlmOverrideDto)
  llmOverride?: LlmOverrideDto;
}
