export class ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;

  constructor(data: T, message = 'OK') {
    this.success = true;
    this.message = message;
    this.data = data;
  }
}

export class ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
  statusCode: number;
}
