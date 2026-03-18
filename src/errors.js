/**
 * Base error class for STT.ai SDK
 */
class STTError extends Error {
  constructor(message, statusCode = null, response = null) {
    super(message);
    this.name = 'STTError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Thrown when the API returns a 429 rate limit response
 */
class RateLimitError extends STTError {
  constructor(message = 'Rate limit exceeded', retryAfter = null, response = null) {
    super(message, 429, response);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when the API returns a 401 or 403 authentication error
 */
class AuthError extends STTError {
  constructor(message = 'Authentication failed', statusCode = 401, response = null) {
    super(message, statusCode, response);
    this.name = 'AuthError';
  }
}

/**
 * Thrown when the user has insufficient credits
 */
class CreditError extends STTError {
  constructor(message = 'Insufficient credits', response = null) {
    super(message, 402, response);
    this.name = 'CreditError';
  }
}

module.exports = { STTError, RateLimitError, AuthError, CreditError };
