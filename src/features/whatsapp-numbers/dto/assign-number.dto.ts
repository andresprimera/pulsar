import { Transform } from 'class-transformer';
import { IsMongoId, IsString, Matches } from 'class-validator';

export class AssignNumberDto {
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Matches(/^\+?\d{6,15}$/, {
    message: 'phoneNumber must be a valid E.164 phone number',
  })
  phoneNumber: string;

  @IsMongoId()
  clientAgentId: string;

  /** Which WhatsApp channel on the hire receives the number. */
  @IsMongoId()
  channelId: string;
}
