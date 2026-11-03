// ===========================================================================
// Success Response
// ===========================================================================

export class SuccessResponse {
  constructor(message = "Success", data = {},statusCode) {
    this.success = true;
    this.message = message;
    this.statusCode = statusCode;
   // if (data) this.data = data; // optional payload
     // Attach any extra fields dynamically
  
    Object.assign(this, data);
  }
}

// ===========================================================================
// Send Response
// ===========================================================================

export function sendResponse(res, responseObj) {
  const statusCode = responseObj.statusCode || 200;
  res.status(statusCode).json(responseObj);
}

// ===========================================================================
// Handle Errors
// ===========================================================================

export class BadRequestError extends Error {
  constructor(message = "Bad Request") {
    super(message);
    this.statusCode = 400;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.statusCode = 401;
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.statusCode = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.statusCode = 404;
  }
}

export class InternalServerError extends Error {
  constructor(message = "Internal Server Error") {
    super(message);
    this.statusCode = 500;
  }
}
export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.statusCode = 409;
  }
}