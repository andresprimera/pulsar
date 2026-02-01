import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateClientAgentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;
}
