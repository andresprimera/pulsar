import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateClientAgentStatusDto {
  @IsEnum(['active', 'inactive', 'archived'])
  @IsNotEmpty()
  status: 'active' | 'inactive' | 'archived';
}
