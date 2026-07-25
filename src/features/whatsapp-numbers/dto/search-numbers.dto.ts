import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SearchNumbersDto {
  @Transform(({ value }) => value?.toUpperCase().trim())
  @IsString()
  @Length(2, 2)
  countryCode: string;

  @IsOptional()
  @IsString()
  areaCode?: string;

  @IsOptional()
  @IsString()
  contains?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
