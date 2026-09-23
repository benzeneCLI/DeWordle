import { HttpExceptionFilter } from '../http-exception.filter';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

describe('HttpExceptionFilter (#1029)', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockRequest = {
      url: '/api/v1/game/play',
      method: 'POST',
      headers: {
        'x-correlation-id': 'test-correlation-123',
      },
    };

    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats uncaught HTTP exception into JSON log with correlation ID', () => {
    const exception = new HttpException('Invalid word attempt', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockArgumentsHost);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('"correlationId":"test-correlation-123"')
    );
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('"statusCode":400')
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });
});