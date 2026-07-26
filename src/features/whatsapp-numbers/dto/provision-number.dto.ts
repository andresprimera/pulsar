import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class ProvisionNumberDto {
  /** Exact number to buy, as returned by the availability search. */
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Matches(/^\+?\d{6,15}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber: string;

  @IsOptional()
  @IsString()
  friendlyName?: string;
}
