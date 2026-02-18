import pino from 'pino';

import { env } from '../../config/env';
import { LOG_REDACTION_OPTIONS } from './redaction';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: LOG_REDACTION_OPTIONS
});
