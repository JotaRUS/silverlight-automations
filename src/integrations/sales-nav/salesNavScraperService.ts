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

/**
 * Raw JS string passed to page.evaluate() — must NOT go through esbuild/tsx
 * because the compiler injects `__name()` helpers that don't exist in the browser.
 */
const EXTRACT_LEADS_SCRIPT = `(() => {
  var results = [];
  var CARD_SELECTORS = [
    'li.artdeco-list__item',
    'ol.search-results__result-list > li',
    '[class*="search-results"] li[class*="result"]',
    '.artdeco-entity-lockup'
  ];
  var cards = [];
  for (var i = 0; i < CARD_SELECTORS.length; i++) {
    var found = document.querySelectorAll(CARD_SELECTORS[i]);
    if (found.length > cards.length) cards = Array.from(found);
  }
  if (cards.length === 0) {
    var allLinks = document.querySelectorAll('a[href*="/sales/lead/"]');
    for (var j = 0; j < allLinks.length; j++) {
      var link = allLinks[j];
      var container = link.closest('li') || (link.parentElement && link.parentElement.parentElement);
      if (container && cards.indexOf(container) === -1) cards.push(container);
    }
  }
  var seen = {};
  for (var k = 0; k < cards.length; k++) {
    var card = cards[k];
    var nameEl =
      card.querySelector('[data-anonymize="person-name"]') ||
      card.querySelector('a[href*="/sales/lead/"] span[dir]') ||
      card.querySelector('a[href*="/sales/lead/"] span') ||
      card.querySelector('.result-lockup__name a') ||
      card.querySelector('.artdeco-entity-lockup__title a span');
    if (!nameEl) continue;
    var fullName = (nameEl.textContent || '').trim();
    if (!fullName || fullName.length < 2) continue;
    var nameParts = fullName.split(/\\s+/);
    var firstName = nameParts[0];
    var lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
    var titleEl =
      card.querySelector('[data-anonymize="title"]') ||
      card.querySelector('.result-lockup__highlight-keyword') ||
      card.querySelector('.artdeco-entity-lockup__subtitle');
    var companyEl =
      card.querySelector('[data-anonymize="company-name"]') ||
      card.querySelector('a[href*="/sales/company/"]') ||
      card.querySelector('.artdeco-entity-lockup__subtitle a');
    var locationEl =
      card.querySelector('[data-anonymize="location"]') ||
      card.querySelector('.result-lockup__misc-item') ||
      card.querySelector('.artdeco-entity-lockup__caption');
    var profileLink =
      card.querySelector('a[href*="/sales/lead/"]') ||
      card.querySelector('a[href*="/in/"]');
    var linkedinUrl;
    if (profileLink) {
      var href = profileLink.getAttribute('href') || '';
      linkedinUrl = href.indexOf('http') === 0
        ? href.split('?')[0]
        : 'https://www.linkedin.com' + href.split('?')[0];
    }
    var jobTitle = titleEl ? (titleEl.textContent || '').trim() : '';
    var companyName = companyEl ? (companyEl.textContent || '').trim() : '';
    var location = locationEl ? (locationEl.textContent || '').trim() : '';
    var key = linkedinUrl || fullName;
    if (seen[key]) continue;
    seen[key] = true;
    results.push({
      fullName: fullName,
      firstName: firstName,
      lastName: lastName,
      jobTitle: jobTitle || undefined,
      companyName: companyName || undefined,
      location: location || undefined,
      linkedinUrl: linkedinUrl
    });
  }
  return results;
})()`;

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

  const leads = await page.evaluate(EXTRACT_LEADS_SCRIPT) as ScrapedLead[];

  if (leads.length === 0) {
    const diagnostics = await page.evaluate(`({
      url: location.href,
      title: document.title,
      bodyTextLength: document.body.innerText.length,
      liCount: document.querySelectorAll('li').length,
      linkToLeadCount: document.querySelectorAll('a[href*="/sales/lead/"]').length,
      personNameCount: document.querySelectorAll('[data-anonymize="person-name"]').length,
      artdecoListItems: document.querySelectorAll('li.artdeco-list__item').length,
      entityLockups: document.querySelectorAll('.artdeco-entity-lockup').length
    })`) as Record<string, unknown>;
    logger.warn(diagnostics, 'sales-nav-scraper-zero-leads-diagnostics');
  }

  return leads;
}

function extractTotalResultCount(page: Page): Promise<number> {
  return page.evaluate(`(() => {
    var h = document.querySelector('.search-results__total-count')
      || document.querySelector('[class*="search-results__result-count"]')
      || document.querySelector('[class*="result-count"]');
    if (!h) return 0;
    var t = (h.textContent || '').replace(/[^0-9]/g, '');
    return parseInt(t, 10) || 0;
  })()`) as Promise<number>;
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

    await page.evaluate(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.evaluate(`window.scrollTo({ top: 0, behavior: 'smooth' })`);
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
