import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['active', 'inactive', 'archived'])
  status: 'active' | 'inactive' | 'archived';
}
