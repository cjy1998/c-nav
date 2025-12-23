export type Bindings = {
  NAV: D1Database;
  NAV_KV: KVNamespace;
};
export enum ResponseCode {
  Success = 200,
  Created = 201,
  Accepted = 202,
  NoContent = 204,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  Conflict = 409,
  Gone = 410,
  PreconditionFailed = 412,
  UnprocessableEntity = 422,
  TooManyRequests = 429,
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
}
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  code: ResponseCode;
  data?: T;
  error?: string;
  timestamp: string;
}
