const LOG_REDACTION_PATHS = [
    'password',
    'confirmPassword',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'apiKey',
    'api_key',
    'jwt',
    'headers.authorization',
    'headers.cookie',
    'headers.x-api-key',
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers.x-api-key',
    'request.headers.authorization',
    'request.headers.cookie'
];

export const LOG_REDACTION_OPTIONS = {
  paths: LOG_REDACTION_PATHS,
  censor: '[REDACTED]'
};
