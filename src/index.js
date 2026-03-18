const { STTClient } = require('./client');
const { STTError, RateLimitError, AuthError, CreditError } = require('./errors');

module.exports = {
  STTClient,
  STTError,
  RateLimitError,
  AuthError,
  CreditError,
};
