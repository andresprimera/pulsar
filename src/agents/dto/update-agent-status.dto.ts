import { IsIn } from 'class-validator';

export class UpdateAgentStatusDto {
  @IsIn(['active', 'inactive', 'archived'])
  status: 'active' | 'inactive' | 'archived';
}
