import { ResponseCode } from "../types";
import { now } from "./index";
import type { ApiResponse } from "../types";

export class ResponseUtil {
  static success<T>(data?: T, message = "Success"): ApiResponse<T> {
    return {
      success: true,
      message,
      code: ResponseCode.Success,
      data,
      timestamp: now(),
    };
  }

  static error(
    message: string,
    code: ResponseCode,
    error?: string
  ): ApiResponse {
    return {
      success: false,
      message,
      code,
      error,
      timestamp: now(),
    };
  }

  static validationError(message = "Validation failed"): ApiResponse {
    return this.error(message, ResponseCode.BadRequest, "VALIDATION_ERROR");
  }

  static notFound(message = "Resource not found"): ApiResponse {
    return this.error(message, ResponseCode.NotFound, "NOT_FOUND");
  }

  static unauthorized(message = "Unauthorized"): ApiResponse {
    return this.error(message, ResponseCode.Unauthorized, "UNAUTHORIZED");
  }

  static forbidden(message = "Forbidden"): ApiResponse {
    return this.error(message, ResponseCode.Forbidden, "FORBIDDEN");
  }

  static serverError(message = "Internal server error"): ApiResponse {
    return this.error(
      message,
      ResponseCode.InternalServerError,
      "SERVER_ERROR"
    );
  }
}
