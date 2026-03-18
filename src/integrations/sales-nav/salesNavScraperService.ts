import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { logger } from '../../core/logging/logger';

const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 8000;
const MAX_CAPTCHA_RETRIES = 3;
const CAPTCHA_WAIT_MS = 60_000;
const MAX_RESULTS_PER_SEARCH = 2500;
const RESULTS_PER_PAGE = 25;

export interface ScrapedLead {
  fullName: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  companyName?: string;
  location?: string;
  linkedinUrl?: string;
}

export interface ScrapeResult {
  leads: ScrapedLead[];
  lastPageScraped: number;
  totalResultsEstimate: number;
  abortedReason?: string;
}

function randomDelay(): Promise<void> {
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function launchScraperBrowser(liAtCookie: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'en-US'
  });

  await context.addCookies([
    {
      name: 'li_at',
      value: liAtCookie,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None'
    }
  ]);

  const page = await context.newPage();
  return { browser, context, page };
}

async function detectAuthFailure(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/login') || url.includes('/authwall') || url.includes('/uas/login')) {
    return true;
  }
  const title = await page.title().catch(() => '');
  if (title.toLowerCase().includes('sign in') || title.toLowerCase().includes('log in')) {
    return true;
  }
  return false;
}

async function detectCaptcha(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/checkpoint') || url.includes('/challenge')) {
    return true;
  }
  const hasCaptchaFrame = await page
    .locator('iframe[src*="captcha"], iframe[src*="challenge"]')
    .count()
    .catch(() => 0);
  return hasCaptchaFrame > 0;
}

function parseFullName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

async function extractLeadsFromPage(page: Page): Promise<ScrapedLead[]> {
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  return page.evaluate(() => {
    const leads: {
      fullName: string;
      firstName?: string;
      lastName?: string;
      jobTitle?: string;
      companyName?: string;
      location?: string;
      linkedinUrl?: string;
    }[] = [];

    const resultCards = document.querySelectorAll(
      'li.artdeco-list__item, ol.search-results__result-list > li, [data-anonymize="person-name"]'
    );

    if (resultCards.length === 0) {
      const rows = document.querySelectorAll('[class*="search-results"] [class*="result"]');
      for (const row of rows) {
        const nameEl =
          row.querySelector('[data-anonymize="person-name"]') ??
          row.querySelector('a[href*="/sales/lead/"] span') ??
          row.querySelector('.result-lockup__name a');
        if (!nameEl) continue;

        const fullName = (nameEl.textContent ?? '').trim();
        if (!fullName) continue;

        const nameParts = fullName.split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

        const titleEl =
          row.querySelector('[data-anonymize="title"]') ??
          row.querySelector('.result-lockup__highlight-keyword');
        const companyEl =
          row.querySelector('[data-anonymize="company-name"]') ??
          row.querySelector('a[href*="/sales/company/"]');
        const locationEl =
          row.querySelector('[data-anonymize="location"]') ??
          row.querySelector('.result-lockup__misc-item');

        const profileLink =
          row.querySelector('a[href*="/sales/lead/"]') ??
          row.querySelector('a[href*="/in/"]');
        let linkedinUrl: string | undefined;
        if (profileLink) {
          const href = profileLink.getAttribute('href') ?? '';
          linkedinUrl = href.startsWith('http')
            ? href.split('?')[0]
            : `https://www.linkedin.com${href.split('?')[0]}`;
        }

        leads.push({
          fullName,
          firstName,
          lastName,
          jobTitle: (titleEl?.textContent ?? '').trim() || undefined,
          companyName: (companyEl?.textContent ?? '').trim() || undefined,
          location: (locationEl?.textContent ?? '').trim() || undefined,
          linkedinUrl
        });
      }
    } else {
      for (const card of resultCards) {
        const nameEl =
          card.querySelector('[data-anonymize="person-name"]') ??
          card.querySelector('a[href*="/sales/lead/"] span') ??
          card.querySelector('.result-lockup__name a');
        if (!nameEl) continue;

        const fullName = (nameEl.textContent ?? '').trim();
        if (!fullName) continue;

        const nameParts = fullName.split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

        const titleEl =
          card.querySelector('[data-anonymize="title"]') ??
          card.querySelector('.result-lockup__highlight-keyword');
        const companyEl =
          card.querySelector('[data-anonymize="company-name"]') ??
          card.querySelector('a[href*="/sales/company/"]');
        const locationEl =
          card.querySelector('[data-anonymize="location"]') ??
          card.querySelector('.result-lockup__misc-item');

        const profileLink =
          card.querySelector('a[href*="/sales/lead/"]') ??
          card.querySelector('a[href*="/in/"]');
        let linkedinUrl: string | undefined;
        if (profileLink) {
          const href = profileLink.getAttribute('href') ?? '';
          linkedinUrl = href.startsWith('http')
            ? href.split('?')[0]
            : `https://www.linkedin.com${href.split('?')[0]}`;
        }

        leads.push({
          fullName,
          firstName,
          lastName,
          jobTitle: (titleEl?.textContent ?? '').trim() || undefined,
          companyName: (companyEl?.textContent ?? '').trim() || undefined,
          location: (locationEl?.textContent ?? '').trim() || undefined,
          linkedinUrl
        });
      }
    }

    return leads;
  });
}

function extractTotalResultCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const headerEl =
      document.querySelector('.search-results__total-count') ??
      document.querySelector('[class*="search-results__result-count"]') ??
      document.querySelector('[class*="result-count"]');
    if (!headerEl) return 0;
    const text = (headerEl.textContent || '').replace(/[^0-9]/g, '');
    return Number.parseInt(text, 10) || 0;
  });
}

export async function scrapeSearchUrl(
  page: Page,
  url: string,
  startPage = 1,
  onProgress?: (pageNum: number, leadsOnPage: number) => void
): Promise<ScrapeResult> {
  const allLeads: ScrapedLead[] = [];
  let currentPage = startPage;
  let totalResultsEstimate = 0;
  let captchaRetries = 0;

  const maxPages = Math.ceil(MAX_RESULTS_PER_SEARCH / RESULTS_PER_PAGE);

  const pageUrl = new URL(url);
  if (startPage > 1) {
    pageUrl.searchParams.set('page', String(startPage));
  }

  logger.info({ url: pageUrl.toString(), startPage }, 'sales-nav-scraper-starting');

  await page.goto(pageUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await randomDelay();

  if (await detectAuthFailure(page)) {
    return {
      leads: allLeads,
      lastPageScraped: Math.max(1, currentPage - 1),
      totalResultsEstimate: 0,
      abortedReason: 'session_expired'
    };
  }

  totalResultsEstimate = await extractTotalResultCount(page);
  const effectiveMaxPages = totalResultsEstimate > 0
    ? Math.min(Math.ceil(totalResultsEstimate / RESULTS_PER_PAGE), maxPages)
    : maxPages;

  while (currentPage <= effectiveMaxPages) {
    if (await detectCaptcha(page)) {
      if (captchaRetries >= MAX_CAPTCHA_RETRIES) {
        logger.warn({ currentPage }, 'sales-nav-scraper-captcha-limit-reached');
        return {
          leads: allLeads,
          lastPageScraped: Math.max(1, currentPage - 1),
          totalResultsEstimate,
          abortedReason: 'captcha_limit'
        };
      }
      captchaRetries++;
      logger.warn({ currentPage, retry: captchaRetries }, 'sales-nav-scraper-captcha-detected-waiting');
      await new Promise((resolve) => setTimeout(resolve, CAPTCHA_WAIT_MS));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await randomDelay();
      continue;
    }

    if (await detectAuthFailure(page)) {
      return {
        leads: allLeads,
        lastPageScraped: Math.max(1, currentPage - 1),
        totalResultsEstimate,
        abortedReason: 'session_expired'
      };
    }

    await page.evaluate(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const pageLeads = await extractLeadsFromPage(page);
    for (const lead of pageLeads) {
      if (!lead.firstName || !lead.lastName) {
        const parsed = parseFullName(lead.fullName);
        lead.firstName ??= parsed.firstName;
        lead.lastName ??= parsed.lastName;
      }
    }

    allLeads.push(...pageLeads);
    onProgress?.(currentPage, pageLeads.length);

    logger.info(
      { currentPage, leadsOnPage: pageLeads.length, totalLeads: allLeads.length },
      'sales-nav-scraper-page-complete'
    );

    if (pageLeads.length === 0) {
      break;
    }

    currentPage++;
    if (currentPage > effectiveMaxPages) {
      break;
    }

    const nextButton = page.locator(
      'button[aria-label="Next"], button.search-results__pagination-next, ' +
      '[class*="pagination"] button:last-child:not([disabled])'
    );
    const nextVisible = await nextButton.first().isVisible().catch(() => false);

    if (nextVisible) {
      await nextButton.first().click();
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    } else {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set('page', String(currentPage));
      await page.goto(nextUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }

    await randomDelay();
  }

  return {
    leads: allLeads,
    lastPageScraped: currentPage,
    totalResultsEstimate
  };
}
