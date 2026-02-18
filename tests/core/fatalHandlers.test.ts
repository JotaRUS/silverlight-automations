import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFatalProcessHandlers } from '../../src/core/process/fatalHandlers';

const PROCESS_HANDLERS_KEY = Symbol.for('sap.process-fatal-handlers-installed');

interface ProcessGlobalState {
  [PROCESS_HANDLERS_KEY]?: boolean;
}

describe('installFatalProcessHandlers', () => {
  const originalProcessOn = process.on.bind(process);

  afterEach(() => {
    process.on = originalProcessOn;
    const state = globalThis as ProcessGlobalState;
    state[PROCESS_HANDLERS_KEY] = undefined;
  });

  it('registers unhandled rejection and uncaught exception listeners once', () => {
    const onSpy = vi.fn();
    process.on = onSpy as unknown as typeof process.on;

    const logger = {
      error: vi.fn()
    } as unknown as Logger;

    installFatalProcessHandlers({ logger });
    installFatalProcessHandlers({ logger });

    expect(onSpy).toHaveBeenCalledTimes(2);
    expect(onSpy).toHaveBeenNthCalledWith(1, 'unhandledRejection', expect.any(Function));
    expect(onSpy).toHaveBeenNthCalledWith(2, 'uncaughtException', expect.any(Function));
  });
});
