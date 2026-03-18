import { chromium, type Browser, type BrowserContext } from 'playwright';

import { logger } from '../../core/logging/logger';

const PLAYWRIGHT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface PlaywrightOAuthResult {
  code: string;
  state: string;
  liAtCookie: string | null;
  liAtCookieExpiry: number | null;
}

/**
 * Launches a headed Chromium browser, navigates to the LinkedIn OAuth
 * authorization URL, and waits for the user to log in and authorize.
 *
 * After LinkedIn redirects to the callback URL, extracts both the OAuth
 * authorization code (from the redirect URL) and the `li_at` session
 * cookie (from the browser context) before closing the browser.
 */
export async function launchLinkedInOAuthBrowser(
  authorizeUrl: string,
  callbackUrlPrefix: string
): Promise<PlaywrightOAuthResult> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });

    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = await context.newPage();

    logger.info('playwright-oauth-navigating-to-linkedin');
    await page.goto(authorizeUrl, { waitUntil: 'domcontentloaded' });

    logger.info('playwright-oauth-waiting-for-user-login');
    await page.waitForURL(`${callbackUrlPrefix}**`, {
      timeout: PLAYWRIGHT_LOGIN_TIMEOUT_MS,
      waitUntil: 'domcontentloaded'
    });

    const finalUrl = new URL(page.url());
    const code = finalUrl.searchParams.get('code');
    const state = finalUrl.searchParams.get('state');

    if (!code || !state) {
      const oauthError = finalUrl.searchParams.get('error');
      const errorDesc = finalUrl.searchParams.get('error_description');
      throw new Error(
        `LinkedIn OAuth redirect missing code/state. error=${oauthError ?? 'none'}, ` +
        `description=${errorDesc ?? 'none'}`
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
    if (browser) {
      await browser.close().catch((err: unknown) => {
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
