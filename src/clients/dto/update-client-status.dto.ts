import { IsIn } from 'class-validator';

export class UpdateClientStatusDto {
  @IsIn(['active', 'inactive', 'archived'])
  status: 'active' | 'inactive' | 'archived';
}
