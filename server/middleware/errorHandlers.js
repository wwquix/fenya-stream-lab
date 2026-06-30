export class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message, options);
    this.status = status;
  }
}

export function routeHandler(handler, failureMessage, options = {}) {
  return async function handleRoute(req, res, next) {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }

      if (options.typeErrorsAreBadRequests && error instanceof TypeError) {
        next(new HttpError(400, error.message, { cause: error }));
        return;
      }

      next(new HttpError(500, failureMessage, { cause: error }));
    }
  };
}

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const isMalformedJson = error instanceof SyntaxError && error.status === 400 && "body" in error;
  const message = isMalformedJson
    ? "Request body contains invalid JSON."
    : typeof error.message === "string" && error.message
    ? error.message
    : "Internal server error";

  if (status >= 500) {
    console.error(`${message}:`, error.cause ?? error);
  }

  res.status(status).json({ error: true, message });
}
