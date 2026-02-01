import { IsEmail, IsMongoId, IsString } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsMongoId()
  clientId: string;
}
