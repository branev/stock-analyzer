import {
  IsNotEmpty,
  IsString,
  Matches,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

const ISO_8601_UTC_SECOND_PRECISION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// Catches strings that pass the regex but produce NaN from `new Date(...)`:
// e.g. "2026-13-01T00:00:00Z" (month 13), "2026-02-30T00:00:00Z" (Feb 30),
// "2026-04-22T25:00:00Z" (hour 25). Without this guard such inputs slip past
// validation, fail the controller's `from < to` comparison silently (every
// NaN comparison is false), and surface as a downstream error instead of
// the documented INVALID_TIMESTAMP. Failing here routes through the
// existing ValidationPipe → BadRequestException → exception filter →
// INVALID_TIMESTAMP path with no other changes.
function IsRealDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRealDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' &&
            !Number.isNaN(new Date(value).getTime())
          );
        },
      },
    });
  };
}

export class AnalyzeDto {
  @IsString()
  @IsNotEmpty()
  @Matches(ISO_8601_UTC_SECOND_PRECISION)
  @IsRealDate()
  from!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(ISO_8601_UTC_SECOND_PRECISION)
  @IsRealDate()
  to!: string;
}
