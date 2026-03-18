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

export interface PlaywrightOAuthResult {
  code: string;
  state: string;
  liAtCookie: string | null;
  liAtCookieExpiry: number | null;
}

/**
 * Launches a headed Chromium browser with a **persistent profile** so
 * the LinkedIn login session survives across invocations. On the first
 * run the user must log in; subsequent launches reuse the stored session
 * and typically only require one-click OAuth consent.
 *
 * After LinkedIn redirects to the callback URL, extracts both the OAuth
 * authorization code (from the redirect URL) and the `li_at` session
 * cookie (from the browser context) before closing the browser.
 */
export async function launchLinkedInOAuthBrowser(
  authorizeUrl: string,
  callbackUrlPrefix: string
): Promise<PlaywrightOAuthResult> {
  let context: BrowserContext | null = null;

  try {
    const profileDir = process.env.PLAYWRIGHT_PROFILE_DIR ?? DEFAULT_PROFILE_DIR;
    await fs.mkdir(profileDir, { recursive: true });

    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ],
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = context.pages()[0] ?? await context.newPage();

    let capturedCode: string | null = null;
    let capturedState: string | null = null;
    let capturedError: string | null = null;
    let capturedErrorDesc: string | null = null;

    const callbackPromise = new Promise<void>((resolve) => {
      void page.route(`${callbackUrlPrefix}**`, (route) => {
        const url = new URL(route.request().url());
        capturedCode = url.searchParams.get('code');
        capturedState = url.searchParams.get('state');
        capturedError = url.searchParams.get('error');
        capturedErrorDesc = url.searchParams.get('error_description');
        logger.info('playwright-oauth-callback-intercepted');
        void route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<html><body><h2>Authorization captured</h2><p>You can close this window.</p></body></html>'
        });
        resolve();
      });
    });

    logger.info('playwright-oauth-navigating-to-linkedin');
    await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' });

    logger.info('playwright-oauth-waiting-for-user-login');
    await Promise.race([
      callbackPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => { reject(new Error('LinkedIn OAuth timed out waiting for user login')); }, PLAYWRIGHT_LOGIN_TIMEOUT_MS)
      )
    ]);

    const code = capturedCode;
    const state = capturedState;

    if (!code || !state) {
      throw new Error(
        `LinkedIn OAuth redirect missing code/state. error=${capturedError ?? 'none'}, ` +
        `description=${capturedErrorDesc ?? 'none'}`
      );
    }

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

    return { code, state, liAtCookie, liAtCookieExpiry };
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
