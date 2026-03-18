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
  leadsEmitted: number;
  lastPageScraped: number;
  totalResultsEstimate: number;
  abortedReason?: string;
}

export interface ScrapeOptions {
  maxLeads: number;
  onLeadScraped: (lead: ScrapedLead) => Promise<void>;
  onProgress?: (pageNum: number, leadsOnPage: number) => void;
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

async function waitForSearchResults(page: Page): Promise<void> {
  const selectors = [
    'li.artdeco-list__item',
    'ol.search-results__result-list > li',
    '[data-anonymize="person-name"]',
    'a[href*="/sales/lead/"]',
    '.artdeco-entity-lockup'
  ];
  try {
    await page.waitForSelector(selectors.join(', '), { timeout: 15_000 });
  } catch {
    logger.warn('sales-nav-scraper-no-results-selector-found');
  }
}

async function extractLeadsFromPage(page: Page): Promise<ScrapedLead[]> {
  await waitForSearchResults(page);

  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  const leads = await page.evaluate(() => {
    const results: {
      fullName: string;
      firstName?: string;
      lastName?: string;
      jobTitle?: string;
      companyName?: string;
      location?: string;
      linkedinUrl?: string;
    }[] = [];

    const CARD_SELECTORS = [
      'li.artdeco-list__item',
      'ol.search-results__result-list > li',
      '[class*="search-results"] li[class*="result"]',
      '.artdeco-entity-lockup'
    ];

    let cards: Element[] = [];
    for (const sel of CARD_SELECTORS) {
      const found = document.querySelectorAll(sel);
      if (found.length > cards.length) {
        cards = Array.from(found);
      }
    }

    if (cards.length === 0) {
      const allLinks = document.querySelectorAll('a[href*="/sales/lead/"]');
      for (const link of allLinks) {
        const container = link.closest('li') ?? link.parentElement?.parentElement;
        if (container && !cards.includes(container)) {
          cards.push(container);
        }
      }
    }

    function extractFromCard(card: Element): typeof results[number] | null {
      const nameEl =
        card.querySelector('[data-anonymize="person-name"]') ??
        card.querySelector('a[href*="/sales/lead/"] span[dir]') ??
        card.querySelector('a[href*="/sales/lead/"] span') ??
        card.querySelector('.result-lockup__name a') ??
        card.querySelector('.artdeco-entity-lockup__title a span');
      if (!nameEl) return null;

      const fullName = (nameEl.textContent ?? '').trim();
      if (!fullName || fullName.length < 2) return null;

      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;

      const titleEl =
        card.querySelector('[data-anonymize="title"]') ??
        card.querySelector('.result-lockup__highlight-keyword') ??
        card.querySelector('.artdeco-entity-lockup__subtitle');
      const companyEl =
        card.querySelector('[data-anonymize="company-name"]') ??
        card.querySelector('a[href*="/sales/company/"]') ??
        card.querySelector('.artdeco-entity-lockup__subtitle a');
      const locationEl =
        card.querySelector('[data-anonymize="location"]') ??
        card.querySelector('.result-lockup__misc-item') ??
        card.querySelector('.artdeco-entity-lockup__caption');

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

      return {
        fullName,
        firstName,
        lastName,
        jobTitle: (titleEl?.textContent ?? '').trim() || undefined,
        companyName: (companyEl?.textContent ?? '').trim() || undefined,
        location: (locationEl?.textContent ?? '').trim() || undefined,
        linkedinUrl
      };
    }

    const seen = new Set<string>();
    for (const card of cards) {
      const lead = extractFromCard(card);
      if (!lead) continue;
      const key = lead.linkedinUrl ?? lead.fullName;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(lead);
    }

    return results;
  });

  if (leads.length === 0) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyTextLength: document.body.innerText.length,
      liCount: document.querySelectorAll('li').length,
      linkToLeadCount: document.querySelectorAll('a[href*="/sales/lead/"]').length,
      personNameCount: document.querySelectorAll('[data-anonymize="person-name"]').length,
      artdecoListItems: document.querySelectorAll('li.artdeco-list__item').length,
      entityLockups: document.querySelectorAll('.artdeco-entity-lockup').length
    }));
    logger.warn(diagnostics, 'sales-nav-scraper-zero-leads-diagnostics');
  }

  return leads;
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
  startPage: number,
  options: ScrapeOptions
): Promise<ScrapeResult> {
  let leadsEmitted = 0;
  let currentPage = startPage;
  let totalResultsEstimate = 0;
  let captchaRetries = 0;

  const maxPages = Math.ceil(MAX_RESULTS_PER_SEARCH / RESULTS_PER_PAGE);

  const pageUrl = new URL(url);
  if (startPage > 1) {
    pageUrl.searchParams.set('page', String(startPage));
  }

  logger.info({ url: pageUrl.toString(), startPage, maxLeads: options.maxLeads }, 'sales-nav-scraper-starting');

  await page.goto(pageUrl.toString(), { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => {
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
  });
  await randomDelay();

  if (await detectAuthFailure(page)) {
    return {
      leadsEmitted: 0,
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
    if (leadsEmitted >= options.maxLeads) {
      logger.info({ leadsEmitted, maxLeads: options.maxLeads }, 'sales-nav-scraper-target-reached');
      break;
    }

    if (await detectCaptcha(page)) {
      if (captchaRetries >= MAX_CAPTCHA_RETRIES) {
        logger.warn({ currentPage }, 'sales-nav-scraper-captcha-limit-reached');
        return {
          leadsEmitted,
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
        leadsEmitted,
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

    let emittedThisPage = 0;
    for (const lead of pageLeads) {
      if (leadsEmitted >= options.maxLeads) break;
      await options.onLeadScraped(lead);
      leadsEmitted++;
      emittedThisPage++;
    }

    options.onProgress?.(currentPage, emittedThisPage);

    logger.info(
      { currentPage, leadsOnPage: pageLeads.length, emittedThisPage, totalEmitted: leadsEmitted, maxLeads: options.maxLeads },
      'sales-nav-scraper-page-complete'
    );

    if (pageLeads.length === 0 || leadsEmitted >= options.maxLeads) {
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
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    } else {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set('page', String(currentPage));
      await page.goto(nextUrl.toString(), { waitUntil: 'networkidle', timeout: 45_000 }).catch(async () => {
        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
      });
    }

    await randomDelay();
  }

  return {
    leadsEmitted,
    lastPageScraped: currentPage,
    totalResultsEstimate
  };
}
