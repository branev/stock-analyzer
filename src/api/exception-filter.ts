import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { OutOfBoundsError } from '../data/price.repository';
import { DataUnavailableError, InvalidRangeError } from './errors';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  code: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof InvalidRangeError) {
      this.send(response, {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
        code: 'INVALID_RANGE',
      });
      return;
    }
    if (exception instanceof OutOfBoundsError) {
      this.send(response, {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
        code: 'OUT_OF_BOUNDS',
      });
      return;
    }
    if (exception instanceof DataUnavailableError) {
      this.logger.error('Data unavailable', exception.stack);
      this.send(response, {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'The dataset is currently unavailable.',
        code: 'DATA_UNAVAILABLE',
      });
      return;
    }
    if (exception instanceof BadRequestException) {
      this.send(response, {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message:
          'from and to must be ISO 8601 UTC timestamps with second precision (yyyy-MM-ddTHH:mm:ssZ).',
        code: 'INVALID_TIMESTAMP',
      });
      return;
    }
    if (exception instanceof HttpException) {
      // Pass-through for HttpExceptions we don't explicitly map: NotFoundException
      // for unmatched routes, ThrottlerException for 429, etc. Keep their native
      // status and response body — those have well-known shapes documented by
      // their own contracts.
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    this.send(response, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
    });
  }

  private send(response: Response, envelope: ErrorEnvelope): void {
    response.status(envelope.statusCode).json(envelope);
  }
}
