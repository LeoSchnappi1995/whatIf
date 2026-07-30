import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import { HTTP_STATUS_TO_RESPONSE_CODE_MAP, ResponseCode } from '../constants/api_response_code';
import type { ApiErrorResponse } from '../interfaces/api_response.interface';
import { BusinessException } from '../interfaces/exception.interface';

function safeErrorText(value: unknown, fallback = '') {
  return String(value || fallback)
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/=]+/gi, 'Bearer <hidden>')
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|authorization|secret)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1<hidden>')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '<data:image omitted>')
    .slice(0, 4000);
}

function objectValue(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function responseMessage(value: unknown, fallback: string) {
  const message = objectValue(value, 'message');
  if (Array.isArray(message)) return message.map(String).join('；');
  return safeErrorText(message, fallback);
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    if (response.headersSent) return;

    const path = String(request?.originalUrl || request?.url || '');
    let payload: Omit<ApiErrorResponse, 'httpStatus'>;
    let httpStatus: HttpStatus;

    if (exception instanceof BusinessException) {
      httpStatus = exception.httpStatus;
      payload = { error: { code: exception.code, message: safeErrorText(exception.message), details: exception.details ? safeErrorText(exception.details) : undefined, fieldErrors: exception.fieldErrors, timestamp: Date.now(), httpStatus, path } };
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus() as HttpStatus;
      const raw = exception.getResponse();
      const declaredStatus = Number(objectValue(raw, 'httpStatus') || 0);
      if (declaredStatus >= 400 && declaredStatus <= 599) httpStatus = declaredStatus;
      const details = objectValue(raw, 'details');
      payload = { error: { code: safeErrorText(objectValue(raw, 'code'), HTTP_STATUS_TO_RESPONSE_CODE_MAP[httpStatus]), message: typeof raw === 'string' ? safeErrorText(raw) : responseMessage(raw, exception.message), details: details ? safeErrorText(typeof details === 'string' ? details : JSON.stringify(details)) : undefined, timestamp: Date.now(), httpStatus, path } };
    } else if (typeof exception === 'object' && exception !== null && (exception as { code?: unknown }).code === '22P02') {
      httpStatus = HttpStatus.NOT_FOUND;
      payload = { error: { code: ResponseCode.NOT_FOUND, message: '资源不存在', timestamp: Date.now(), httpStatus, path } };
    } else {
      const declaredStatus = Number(objectValue(exception, 'httpStatus') || 0);
      httpStatus = declaredStatus >= 400 && declaredStatus <= 599 ? declaredStatus : HttpStatus.INTERNAL_SERVER_ERROR;
      const details = objectValue(exception, 'details');
      payload = { error: { code: safeErrorText(objectValue(exception, 'code'), ResponseCode.INTERNAL_ERROR), message: safeErrorText(exception instanceof Error ? exception.message : exception, '服务器内部错误'), details: details ? safeErrorText(typeof details === 'string' ? details : JSON.stringify(details)) : undefined, timestamp: Date.now(), httpStatus, path } };
    }
    response.status(httpStatus).json(payload);
  }
}
