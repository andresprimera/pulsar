import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class ConfigureWebhookDto {
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Matches(/^\+?\d{6,15}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber: string;
}
