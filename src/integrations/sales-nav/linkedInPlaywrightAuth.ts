import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium, type BrowserContext } from 'playwright';

import { logger } from '../../core/logging/logger';

const PLAYWRIGHT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const DEFAULT_PROFILE_DIR = path.join(
  os.homedir(),
  '.silverlight',
  'playwright-linkedin-profile'
);

const BROWSER_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox'
];
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export interface PlaywrightOAuthResult {
  code: string;
  state: string;
  liAtCookie: string | null;
  liAtCookieExpiry: number | null;
}

/**
 * Runs the OAuth + cookie-capture flow inside a browser context.
 * The callback URL is intercepted via page.route() (awaited before
 * navigation) so the request never reaches the Express callback handler.
 */
async function runOAuthFlow(
  context: BrowserContext,
  authorizeUrl: string,
  callbackUrlPrefix: string,
  timeoutMs: number
): Promise<PlaywrightOAuthResult> {
  const page = context.pages()[0] ?? await context.newPage();

  let capturedCode: string | null = null;
  let capturedState: string | null = null;
  let capturedError: string | null = null;
  let capturedErrorDesc: string | null = null;
  let callbackResolve: (() => void) | null = null;

  const callbackPromise = new Promise<void>((resolve) => {
    callbackResolve = resolve;
  });

  // Register the interceptor at the context level so it applies to the
  // full top-level navigation, not just the current page instance.
  await context.route(`${callbackUrlPrefix}**`, (route) => {
    const url = new URL(route.request().url());
    capturedCode = url.searchParams.get('code');
    capturedState = url.searchParams.get('state');
    capturedError = url.searchParams.get('error');
    capturedErrorDesc = url.searchParams.get('error_description');
    logger.info('playwright-oauth-callback-intercepted');
    void route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><p>Done</p></body></html>'
    });
    callbackResolve?.();
  });

  logger.info('playwright-oauth-navigating-to-linkedin');
  await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' });

  logger.info('playwright-oauth-waiting-for-redirect');
  await Promise.race([
    callbackPromise,
    new Promise<void>((_, reject) =>
      setTimeout(() => {
        reject(new Error('LinkedIn OAuth timed out'));
      }, timeoutMs)
    )
  ]);

  if (!capturedCode || !capturedState) {
    throw new Error(
      `LinkedIn OAuth redirect missing code/state. error=${capturedError ?? 'none'}, ` +
      `description=${capturedErrorDesc ?? 'none'}`
    );
  }

  await context.unroute(`${callbackUrlPrefix}**`).catch(() => {
    logger.warn('playwright-oauth-callback-unroute-failed');
  });

  let liAtCookie: string | null = null;
  let liAtCookieExpiry: number | null = null;
  const cookies = await context.cookies('https://www.linkedin.com');
  const liAt = cookies.find((c) => c.name === 'li_at');
  if (liAt) {
    liAtCookie = liAt.value;
    liAtCookieExpiry = liAt.expires > 0 ? liAt.expires : null;
    logger.info('playwright-oauth-li_at-cookie-captured');
  } else {
    logger.warn('playwright-oauth-li_at-cookie-not-found');
  }

  return { code: capturedCode, state: capturedState, liAtCookie, liAtCookieExpiry };
}

/**
 * Launches a Chromium browser with a persistent profile so the LinkedIn
 * login session survives across invocations.
 *
 * We keep this flow headed because LinkedIn session reuse only works
 * reliably against the same persistent Playwright profile. A short-lived
 * headless preflight created a bad UX and was not reliably reusing the
 * stored session.
 */
export async function launchLinkedInOAuthBrowser(
  authorizeUrl: string,
  callbackUrlPrefix: string
): Promise<PlaywrightOAuthResult> {
  const profileDir = process.env.PLAYWRIGHT_PROFILE_DIR ?? DEFAULT_PROFILE_DIR;
  await fs.mkdir(profileDir, { recursive: true });
  let context: BrowserContext | null = null;
  try {
    logger.info('playwright-oauth-launching-headed');
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: BROWSER_ARGS,
      userAgent: USER_AGENT,
      locale: 'en-US'
    });

    const result = await runOAuthFlow(
      context,
      authorizeUrl,
      callbackUrlPrefix,
      PLAYWRIGHT_LOGIN_TIMEOUT_MS
    );
    logger.info('playwright-oauth-headed-success');
    return result;
  } finally {
    if (context) {
      await context.close().catch((err: unknown) => {
        logger.warn({ err }, 'playwright-oauth-browser-close-error');
      });
    }
  }
}

/**
 * Detects whether a headed browser can be launched (i.e. a display is
 * available). Returns false in headless server environments.
 */
export async function canLaunchHeadedBrowser(): Promise<boolean> {
  try {
    const browser = await chromium.launch({ headless: false });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}
