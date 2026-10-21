import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(message: string, status: number = HttpStatus.BAD_REQUEST, code?: string) {
    super({ success: false, message, code: code ?? 'BAD_REQUEST' }, status);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not found') {
    super({ success: false, message, code: 'NOT_FOUND' }, HttpStatus.NOT_FOUND);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Access denied') {
    super({ success: false, message, code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super({ success: false, message, code }, HttpStatus.CONFLICT);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Authentication required') {
    super({ success: false, message, code: 'UNAUTHORIZED' }, HttpStatus.UNAUTHORIZED);
  }
}
