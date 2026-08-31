import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { ApiResponse } from '../types/api-response.interface';

/**
 * PostgreSQL error codes for common constraint violations
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
};

/**
 * Maps constraint names to user-friendly field names
 */
const CONSTRAINT_FIELD_MAP: Record<string, string> = {
  // Users
  UQ_users_email: 'email',
  UQ_97672ac88f789774dd47f7c8be: 'email', // User email
  // Products
  UQ_c44ac33a05b144dd0d9ddcf9327: 'SKU',
  UQ_products_sku: 'SKU',
  // Categories
  UQ_categories_name: 'name',
  UQ_categories_slug: 'slug',
  // Customers
  UQ_customers_phone: 'phone number',
  UQ_customers_email: 'email',
  // Roles
  UQ_roles_name: 'name',
  // Branches
  UQ_branches_name: 'name',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';

    // Handle HttpException (NestJS built-in exceptions)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
          ? Array.isArray((exceptionResponse as any).message)
            ? (exceptionResponse as any).message.join(', ')
            : (exceptionResponse as any).message
          : (exceptionResponse as string);
    }
    // Handle TypeORM QueryFailedError (database constraint violations)
    else if (exception instanceof QueryFailedError) {
      const dbError = exception as QueryFailedError & {
        code?: string;
        constraint?: string;
        detail?: string;
        table?: string;
        column?: string;
      };

      const errorCode = dbError.code;
      const constraint = dbError.constraint;
      const detail = dbError.detail;

      switch (errorCode) {
        case PG_ERROR_CODES.UNIQUE_VIOLATION:
          status = HttpStatus.CONFLICT;
          message = this.formatUniqueViolationMessage(constraint, detail);
          break;

        case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
          status = HttpStatus.CONFLICT;
          message = this.formatForeignKeyViolationMessage(constraint, detail);
          break;

        case PG_ERROR_CODES.NOT_NULL_VIOLATION:
          status = HttpStatus.BAD_REQUEST;
          message = this.formatNotNullViolationMessage(dbError.column);
          break;

        case PG_ERROR_CODES.CHECK_VIOLATION:
          status = HttpStatus.BAD_REQUEST;
          message = 'The provided value does not meet the required constraints';
          break;

        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'A database error occurred. Please check your input and try again.';
      }
    }
    // Handle TypeORM EntityNotFoundError
    else if (exception instanceof EntityNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      message = 'The requested resource was not found';
    }
    // Handle generic errors
    else if (exception instanceof Error) {
      // Keep as internal server error but log it
      message = 'An unexpected error occurred. Please try again later.';
    }

    this.logger.error(
      `Http Status: ${status} Error Message: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined
    );

    const errorResponse: ApiResponse = {
      success: false,
      message,
    };

    response.status(status).json(errorResponse);
  }

  /**
   * Format a user-friendly message for unique constraint violations
   */
  private formatUniqueViolationMessage(constraint?: string, detail?: string): string {
    // Try to get field name from constraint map
    if (constraint && CONSTRAINT_FIELD_MAP[constraint]) {
      const fieldName = CONSTRAINT_FIELD_MAP[constraint];
      return `A record with this ${fieldName} already exists. Please use a different value.`;
    }

    // Try to extract field from detail message
    // Detail format: Key (field_name)=(value) already exists.
    if (detail) {
      const match = detail.match(/Key \(([^)]+)\)=/);
      if (match) {
        const fieldName = match[1]
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .toLowerCase();
        return `A record with this ${fieldName} already exists. Please use a different value.`;
      }
    }

    return 'A record with this value already exists. Please use a different value.';
  }

  /**
   * Format a user-friendly message for foreign key constraint violations
   */
  private formatForeignKeyViolationMessage(constraint?: string, detail?: string): string {
    // Check if it's a deletion blocked by reference
    if (detail?.includes('is still referenced from')) {
      // Extract table name from detail
      // Format: Key (id)=(value) is still referenced from table "table_name"
      const tableMatch = detail.match(/referenced from table "([^"]+)"/);
      if (tableMatch) {
        const tableName = tableMatch[1]
          .replace(/_/g, ' ')
          .replace(/s$/, '') // Remove trailing 's' for singular
          .toLowerCase();
        return `Cannot delete this record because it is being used by one or more ${tableName} records. Please remove those references first.`;
      }
      return 'Cannot delete this record because it is being used by other records. Please remove those references first.';
    }

    // Check if it's an invalid reference
    if (detail?.includes('is not present in table')) {
      const tableMatch = detail.match(/not present in table "([^"]+)"/);
      if (tableMatch) {
        const tableName = tableMatch[1].replace(/_/g, ' ').replace(/s$/, '').toLowerCase();
        return `The specified ${tableName} does not exist. Please select a valid option.`;
      }
      return 'The referenced record does not exist. Please select a valid option.';
    }

    return 'This operation cannot be completed due to related records. Please check your input.';
  }

  /**
   * Format a user-friendly message for not-null constraint violations
   */
  private formatNotNullViolationMessage(column?: string): string {
    if (column) {
      const fieldName = column
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase();
      return `The ${fieldName} field is required and cannot be empty.`;
    }
    return 'A required field is missing. Please fill in all required fields.';
  }
}
