import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateClientAgentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;
}
