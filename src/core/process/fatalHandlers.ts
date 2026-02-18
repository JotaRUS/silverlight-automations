import type { Logger } from 'pino';

export interface FatalHandlerOptions {
  logger: Logger;
  onFatalError?: () => Promise<void>;
}

const PROCESS_HANDLERS_KEY = Symbol.for('sap.process-fatal-handlers-installed');

interface ProcessGlobalState {
  [PROCESS_HANDLERS_KEY]?: boolean;
}

function getProcessGlobalState(): ProcessGlobalState {
  return globalThis as unknown as ProcessGlobalState;
}

export function installFatalProcessHandlers(options: FatalHandlerOptions): void {
  const globalState = getProcessGlobalState();
  if (globalState[PROCESS_HANDLERS_KEY]) {
    return;
  }
  globalState[PROCESS_HANDLERS_KEY] = true;

  const handleFatal = async (
    error: unknown,
    source: 'unhandledRejection' | 'uncaughtException'
  ): Promise<void> => {
    options.logger.error({ err: error, source }, 'fatal-process-error');
    if (options.onFatalError) {
      try {
        await options.onFatalError();
      } catch (shutdownError) {
        options.logger.error({ err: shutdownError, source }, 'fatal-process-shutdown-failed');
      }
    }
    process.exit(1);
  };

  process.on('unhandledRejection', (reason) => {
    void handleFatal(reason, 'unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    void handleFatal(error, 'uncaughtException');
  });
}
