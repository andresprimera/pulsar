import { IsInt, IsMongoId, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClientAgentDto {
  @IsMongoId()
  @IsNotEmpty()
  clientId: string;

  @IsMongoId()
  @IsNotEmpty()
  agentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsNotEmpty()
  price: number;
}
