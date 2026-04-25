import { IsNotEmpty, IsString, Matches } from 'class-validator';

const ISO_8601_UTC_SECOND_PRECISION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export class AnalyzeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(ISO_8601_UTC_SECOND_PRECISION)
  from!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(ISO_8601_UTC_SECOND_PRECISION)
  to!: string;
}
