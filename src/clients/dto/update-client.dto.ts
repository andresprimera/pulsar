import { IsOptional, IsString } from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;
}
