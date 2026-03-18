import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium, type BrowserContext } from 'playwright';

import { logger } from '../../core/logging/logger';

const SESSION_CAPTURE_TIMEOUT_MS = 3 * 60 * 1000;
const COOKIE_POLL_INTERVAL_MS = 2_000;
const BROWSER_ARGS = ['--disable-blink-features=AutomationControlled', '--no-sandbox'];
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

export interface LinkedInChromeProfileDiagnostics {
  executablePath: string | null;
  userDataDir: string | null;
  profileDirectory: string | null;
  executableExists: boolean;
  userDataDirExists: boolean;
  profileExists: boolean;
  profileLocked: boolean;
  usingConfiguredPaths: boolean;
}

interface LinkedInChromeCaptureConfig {
  executablePath: string | null;
  userDataDir: string | null;
  profileDirectory: string | null;
  usingConfiguredPaths: boolean;
}

export interface LinkedInChromeProfileCaptureResult {
  liAtCookie: string;
  liAtCookieExpiry: number | null;
  diagnostics: LinkedInChromeProfileDiagnostics;
}

function expandHomeDir(value: string): string {
  if (!value.startsWith('~/')) return value;
  return path.join(os.homedir(), value.slice(2));
}

async function pathExists(targetPath: string | null): Promise<boolean> {
  if (!targetPath) return false;
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getDefaultChromeExecutables(): string[] {
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? '';
    return [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : ''
    ].filter(Boolean);
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
}

function getDefaultChromeUserDataDir(): string | null {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData ? path.join(localAppData, 'Google', 'Chrome', 'User Data') : null;
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

async function resolveChromeExecutablePath(configuredPath?: string): Promise<string | null> {
  if (configuredPath && configuredPath.trim().length > 0) {
    return expandHomeDir(configuredPath.trim());
  }

  const candidates = getDefaultChromeExecutables();
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? null;
}

async function resolveChromeProfileDirectory(
  userDataDir: string | null,
  configuredProfileDirectory?: string
): Promise<string | null> {
  if (configuredProfileDirectory && configuredProfileDirectory.trim().length > 0) {
    return configuredProfileDirectory.trim();
  }
  if (!userDataDir) return null;

  try {
    const localStateRaw = await fs.readFile(path.join(userDataDir, 'Local State'), 'utf8');
    const localState = JSON.parse(localStateRaw) as {
      profile?: { last_used?: unknown };
    };
    if (typeof localState.profile?.last_used === 'string' && localState.profile.last_used.length > 0) {
      return localState.profile.last_used;
    }
  } catch {
    // Fall back to Default below.
  }

  return 'Default';
}

async function resolveChromeCaptureConfig(
  credentials: Record<string, unknown>
): Promise<LinkedInChromeCaptureConfig> {
  const executablePath = await resolveChromeExecutablePath(
    typeof credentials.chromeExecutablePath === 'string' ? credentials.chromeExecutablePath : undefined
  );
  const configuredUserDataDir =
    typeof credentials.chromeUserDataDir === 'string' && credentials.chromeUserDataDir.trim().length > 0
      ? expandHomeDir(credentials.chromeUserDataDir.trim())
      : null;
  const userDataDir = configuredUserDataDir ?? getDefaultChromeUserDataDir();
  const profileDirectory = await resolveChromeProfileDirectory(
    userDataDir,
    typeof credentials.chromeProfileDirectory === 'string' ? credentials.chromeProfileDirectory : undefined
  );

  return {
    executablePath,
    userDataDir,
    profileDirectory,
    usingConfiguredPaths: Boolean(
      typeof credentials.chromeExecutablePath === 'string' ||
      typeof credentials.chromeUserDataDir === 'string' ||
      typeof credentials.chromeProfileDirectory === 'string'
    )
  };
}

async function isChromeProfileLocked(userDataDir: string | null): Promise<boolean> {
  if (!userDataDir) return false;
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const fileName of lockFiles) {
    if (await pathExists(path.join(userDataDir, fileName))) {
      return true;
    }
  }
  return false;
}

export async function getLinkedInChromeProfileDiagnostics(
  credentials: Record<string, unknown>
): Promise<LinkedInChromeProfileDiagnostics> {
  const config = await resolveChromeCaptureConfig(credentials);
  const executableExists = await pathExists(config.executablePath);
  const userDataDirExists = await pathExists(config.userDataDir);
  const profilePath =
    config.userDataDir && config.profileDirectory
      ? path.join(config.userDataDir, config.profileDirectory)
      : null;
  const profileExists = profilePath
    ? await pathExists(profilePath)
    : false;
  const profileLocked = userDataDirExists
    ? await isChromeProfileLocked(config.userDataDir)
    : false;

  return {
    executablePath: config.executablePath,
    userDataDir: config.userDataDir,
    profileDirectory: config.profileDirectory,
    executableExists,
    userDataDirExists,
    profileExists,
    profileLocked,
    usingConfiguredPaths: config.usingConfiguredPaths
  };
}

export async function captureLinkedInSessionCookieFromChromeProfile(
  credentials: Record<string, unknown>
): Promise<LinkedInChromeProfileCaptureResult> {
  const diagnostics = await getLinkedInChromeProfileDiagnostics(credentials);

  if (!diagnostics.executableExists || !diagnostics.executablePath) {
    throw new Error('Google Chrome executable not found. Update the provider account Chrome path settings and try again.');
  }
  if (!diagnostics.userDataDirExists || !diagnostics.userDataDir) {
    throw new Error('Chrome user data directory not found. Update the provider account Chrome path settings and try again.');
  }
  if (!diagnostics.profileExists || !diagnostics.profileDirectory) {
    throw new Error('Configured Chrome profile directory was not found. Check the profile name and try again.');
  }
  if (diagnostics.profileLocked) {
    throw new Error('Google Chrome appears to be open and is locking the selected profile. Close Chrome and try again.');
  }

  let context: BrowserContext | null = null;
  try {
    logger.info(
      {
        executablePath: diagnostics.executablePath,
        userDataDir: diagnostics.userDataDir,
        profileDirectory: diagnostics.profileDirectory
      },
      'linkedin-session-capture-launching-chrome-profile'
    );

    context = await chromium.launchPersistentContext(diagnostics.userDataDir, {
      headless: false,
      executablePath: diagnostics.executablePath,
      viewport: { width: 1280, height: 900 },
      args: [...BROWSER_ARGS, `--profile-directory=${diagnostics.profileDirectory}`],
      userAgent: USER_AGENT,
      locale: 'en-US'
    });

    const page = context.pages()[0] ?? await context.newPage();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }).catch(() => {
      logger.warn('linkedin-session-capture-navigation-warning');
    });
    await page.bringToFront().catch(() => {
      logger.warn('linkedin-session-capture-bring-to-front-warning');
    });

    const deadline = Date.now() + SESSION_CAPTURE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const cookies = await context.cookies('https://www.linkedin.com');
      const liAtCookie = cookies.find((cookie) => cookie.name === 'li_at');
      if (liAtCookie?.value) {
        logger.info('linkedin-session-capture-cookie-found');
        return {
          liAtCookie: liAtCookie.value,
          liAtCookieExpiry: liAtCookie.expires > 0 ? liAtCookie.expires : null,
          diagnostics
        };
      }
      await page.waitForTimeout(COOKIE_POLL_INTERVAL_MS);
    }

    throw new Error(
      'Could not capture the LinkedIn session cookie from this Chrome profile. Make sure the selected Chrome profile is signed in to LinkedIn.'
    );
  } finally {
    if (context) {
      await context.close().catch((error: unknown) => {
        logger.warn({ error }, 'linkedin-session-capture-close-error');
      });
    }
  }
}
