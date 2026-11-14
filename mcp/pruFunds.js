/**
 * Pru Life UK (Philippines) PRULink fund NAVPU fetcher & parser.
 *
 * Source: public "Daily Unit Prices" tables on
 *   https://www.prulifeuk.com.ph/en/products/investment/prulink-funds/
 * (allowed by robots.txt: `Allow: /en/`). The page is server-rendered and shows
 * the two most recent valuation dates per fund, so history is accumulated by
 * fetching once per day and storing each (fund, date) price.
 */

export const PRU_FUNDS_URL = "https://www.prulifeuk.com.ph/en/products/investment/prulink-funds/";

/**
 * Official 22 PRULink Peso & Dollar Funds published on prulifeuk.com.ph
 * with baseline valuation dates (10-Nov-26 & 11-Nov-26).
 */
export const DEFAULT_PRU_FUNDS_SEED = [
  { fundCode: "MONEY_MARKET_FUND", fundName: "PRULink Money Market Fund", currency: "PHP", category: "Conservative", prices: [{ date: "2026-11-10", navpu: 1.29885 }, { date: "2026-11-11", navpu: 1.29894 }] },
  { fundCode: "PESO_BOND_FUND", fundName: "PRULink Bond Fund (Peso)", currency: "PHP", category: "Conservative", prices: [{ date: "2026-11-10", navpu: 3.1055 }, { date: "2026-11-11", navpu: 3.10714 }, { date: "2026-11-13", navpu: 3.10431 }] },
  { fundCode: "CASH_FLOW_FUND_PHP_HEDGED_SHARE_CLASS", fundName: "PRULink Cash Flow Fund – Php Hedged Share Class", currency: "PHP", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 0.92541 }, { date: "2026-11-11", navpu: 0.92914 }] },
  { fundCode: "CASH_FLOW_FUND_PLUS_PHP_HEDGED_SHARE_CLASS", fundName: "PRULink Cash Flow Fund Plus – Php Hedged Share Class", currency: "PHP", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 0.94994 }, { date: "2026-11-11", navpu: 0.95191 }] },
  { fundCode: "MANAGED_FUND", fundName: "PRULink Managed Fund", currency: "PHP", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 3.373 }, { date: "2026-11-11", navpu: 3.37575 }, { date: "2026-11-13", navpu: 3.36751 }] },
  { fundCode: "FLEXI_INCOME_FUND", fundName: "PRULink Flexi Income Fund", currency: "PHP", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 1.08436 }, { date: "2026-11-11", navpu: 1.09335 }] },
  { fundCode: "STRATEGIC_INCOME_FUND_PHP_UNHEDGED_SHARE_CLASS", fundName: "PRULink Strategic Income Fund – Php Unhedged Share Class", currency: "PHP", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 1.06066 }, { date: "2026-11-11", navpu: 1.06703 }] },
  { fundCode: "PROACTIVE_FUND", fundName: "PRULink Proactive Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.96816 }, { date: "2026-11-11", navpu: 1.97062 }] },
  { fundCode: "GROWTH_FUND", fundName: "PRULink Growth Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 3.1209 }, { date: "2026-11-11", navpu: 3.12623 }, { date: "2026-11-13", navpu: 3.10385 }] },
  { fundCode: "GLOBAL_TECH_NAVIGATOR_FUND", fundName: "PRULink Global Tech Navigator Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.55135 }, { date: "2026-11-11", navpu: 1.53355 }] },
  { fundCode: "EQUITY_INDEX_TRACKER_FUND", fundName: "PRULink Equity Index Tracker Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.02812 }, { date: "2026-11-11", navpu: 1.02402 }] },
  { fundCode: "EQUITY_FUND", fundName: "PRULink Equity Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.64208 }, { date: "2026-11-11", navpu: 1.64538 }] },
  { fundCode: "GLOBAL_MARKET_NAVIGATOR_FUND", fundName: "PRULink Global Market Navigator Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.56479 }, { date: "2026-11-11", navpu: 1.57469 }, { date: "2026-11-13", navpu: 1.58838 }] },
  { fundCode: "GLOBAL_EQUITY_NAVIGATOR_FUND", fundName: "PRULink Global Equity Navigator Fund", currency: "PHP", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.58263 }, { date: "2026-11-11", navpu: 1.59777 }, { date: "2026-11-13", navpu: 1.61363 }] },
  { fundCode: "DOLLAR_BOND_FUND", fundName: "PRULink Dollar Bond Fund", currency: "USD", category: "Conservative", prices: [{ date: "2026-11-10", navpu: 2.5983 }, { date: "2026-11-11", navpu: 2.5836 }] },
  { fundCode: "ASIAN_LOCAL_BOND_FUND", fundName: "PRULink Asian Local Bond Fund", currency: "USD", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 1.10402 }, { date: "2026-11-11", navpu: 1.09991 }] },
  { fundCode: "CASH_FLOW_FUND_USD_SHARE_CLASS", fundName: "PRULink Cash Flow Fund – USD Share Class", currency: "USD", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 0.78403 }, { date: "2026-11-11", navpu: 0.78553 }] },
  { fundCode: "CASH_FLOW_FUND_PLUS_USD_SHARE_CLASS", fundName: "PRULink Cash Flow Fund Plus – USD Share Class", currency: "USD", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 0.97588 }, { date: "2026-11-11", navpu: 0.97609 }] },
  { fundCode: "ASIAN_BALANCED_FUND", fundName: "PRULink Asian Balanced Fund", currency: "USD", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 1.26238 }, { date: "2026-11-11", navpu: 1.26787 }] },
  { fundCode: "STRATEGIC_INCOME_FUND_USD_SHARE_CLASS", fundName: "PRULink Strategic Income Fund – USD Share Class", currency: "USD", category: "Moderate", prices: [{ date: "2026-11-10", navpu: 1.01172 }, { date: "2026-11-11", navpu: 1.0126 }] },
  { fundCode: "ASIA_PACIFIC_EQUITY_FUND", fundName: "PRULink Asia Pacific Equity Fund", currency: "USD", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.64506 }, { date: "2026-11-11", navpu: 1.66098 }] },
  { fundCode: "GLOBAL_EMERGING_MARKETS_DYNAMIC_FUND", fundName: "PRULink Global Emerging Markets Dynamic Fund", currency: "USD", category: "Aggressive", prices: [{ date: "2026-11-10", navpu: 1.7466 }, { date: "2026-11-11", navpu: 1.75937 }] },
];

/**
 * Default policy holdings from PruServices Portal (Initial Account as of 13 Nov 2026)
 * Total Value: PHP 71,981.70 across 5 PRULink funds.
 */
export const DEFAULT_PRU_HOLDINGS = [
  {
    id: "pru_hold_pgen",
    fundCode: "GLOBAL_EQUITY_NAVIGATOR_FUND",
    fundName: "PRULink Global Equity Navigator Fund",
    ticker: "PGEN",
    accountSection: "Initial Account",
    policyType: "PRULink Assurance Account Plus (PAA+)",
    policyNo: "Initial Account",
    currency: "PHP",
    units: 9805.25945,
    snapshotNavpu: 1.61363,
    snapshotValue: 15822.06,
    totalPremiumsPaid: 0,
    asOf: "2026-11-13",
  },
  {
    id: "pru_hold_bond",
    fundCode: "PESO_BOND_FUND",
    fundName: "PRULink Bond Fund",
    ticker: "PBOND",
    accountSection: "Initial Account",
    policyType: "PRULink Assurance Account Plus (PAA+)",
    policyNo: "Initial Account",
    currency: "PHP",
    units: 3060.55893,
    snapshotNavpu: 3.10431,
    snapshotValue: 9500.92,
    totalPremiumsPaid: 0,
    asOf: "2026-11-13",
  },
  {
    id: "pru_hold_gmnf",
    fundCode: "GLOBAL_MARKET_NAVIGATOR_FUND",
    fundName: "PRULink Global Market Navigator Fund",
    ticker: "PGMN",
    accountSection: "Initial Account",
    policyType: "PRULink Assurance Account Plus (PAA+)",
    policyNo: "Initial Account",
    currency: "PHP",
    units: 20926.39551,
    snapshotNavpu: 1.58838,
    snapshotValue: 33239.06,
    totalPremiumsPaid: 0,
    asOf: "2026-11-13",
  },
  {
    id: "pru_hold_growth",
    fundCode: "GROWTH_FUND",
    fundName: "PRULink Growth Fund",
    ticker: "PGROW",
    accountSection: "Initial Account",
    policyType: "PRULink Assurance Account Plus (PAA+)",
    policyNo: "Initial Account",
    currency: "PHP",
    units: 1615.50918,
    snapshotNavpu: 3.10385,
    snapshotValue: 5014.29,
    totalPremiumsPaid: 0,
    asOf: "2026-11-13",
  },
  {
    id: "pru_hold_managed",
    fundCode: "MANAGED_FUND",
    fundName: "PRULink Managed Fund",
    ticker: "PMGD",
    accountSection: "Initial Account",
    policyType: "PRULink Assurance Account Plus (PAA+)",
    policyNo: "Initial Account",
    currency: "PHP",
    units: 2496.02016,
    snapshotNavpu: 3.36751,
    snapshotValue: 8405.37,
    totalPremiumsPaid: 0,
    asOf: "2026-11-13",
  },
];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function cleanText(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, " "))
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "11-Nov-26" -> "2026-11-11" */
export function parsePruDate(text) {
  const m = String(text || "").match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${yr}-${String(mon).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

export function slugFundCode(name) {
  return String(name || "")
    .replace(/^PRULink\s+/i, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseNumber(text) {
  const t = cleanText(text).replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/**
 * Parse the PRULink fund page HTML.
 * @returns {{ funds: Array<{fundCode, fundName, currency, category, prices: Array<{date, navpu}>}>, dates: string[] }}
 */
export function parsePruFundPricesHtml(html) {
  const src = String(html || "");
  const funds = [];
  const allDates = new Set();
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(src))) {
    const table = tm[0];
    const headerRow = (table.match(/<tr[\s\S]*?<\/tr>/i) || [""])[0];
    const headerCells = [...headerRow.matchAll(/<t[hd][\s\S]*?<\/t[hd]>/gi)].map((c) => cleanText(c[0]));
    const dateCols = headerCells.map(parsePruDate);
    if (dateCols.filter(Boolean).length === 0) continue;

    // Currency from the nearest heading before the table.
    const before = src.slice(Math.max(0, tm.index - 3000), tm.index);
    const headings = [...before.matchAll(/<h[1-4][\s\S]*?<\/h[1-4]>/gi)].map((h) => cleanText(h[0]));
    const heading = headings[headings.length - 1] || "";
    const currency = /dollar|usd/i.test(heading) ? "USD" : "PHP";

    let category = "";
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].slice(1);
    for (const r of rows) {
      const cells = [...r[0].matchAll(/<td[\s\S]*?<\/td>/gi)].map((c) => c[0]);
      if (cells.length === 1) {
        const label = cleanText(cells[0]);
        if (label) category = label;
        continue;
      }
      if (cells.length < 2) continue;
      const fundName = cleanText(cells[0]);
      if (!fundName) continue;
      const prices = [];
      for (let i = 1; i < cells.length; i++) {
        const date = dateCols[i];
        const navpu = parseNumber(cells[i]);
        if (date && navpu != null && navpu > 0) {
          prices.push({ date, navpu });
          allDates.add(date);
        }
      }
      if (prices.length === 0) continue;
      funds.push({ fundCode: slugFundCode(fundName), fundName, currency, category, prices });
    }
  }
  return { funds, dates: [...allDates].sort() };
}

export async function fetchPruFundPrices({ fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(PRU_FUNDS_URL, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BudgetApp2025-FundTracker/1.0; personal NAVPU tracker)",
        Accept: "text/html",
      },
    });
    if (!res.ok) throw new Error(`Pru Life UK page returned HTTP ${res.status}`);
    const html = await res.text();
    const parsed = parsePruFundPricesHtml(html);
    if (parsed.funds.length === 0) {
      throw new Error("No fund prices found — the Pru Life UK page layout may have changed.");
    }
    return { ...parsed, source: PRU_FUNDS_URL, fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merge freshly parsed funds into an existing pruFunds store (idempotent: one
 * price per fund per date). Returns a new object.
 */
export function mergePruPrices(store = {}, parsed = { funds: [] }, source = "website") {
  const prices = { ...(store.prices || {}) };
  const catalog = { ...(store.catalog || {}) };
  const holdings =
    Array.isArray(store.holdings) && store.holdings.length > 0
      ? store.holdings
      : DEFAULT_PRU_HOLDINGS;
  let added = 0;
  for (const f of parsed.funds || []) {
    catalog[f.fundCode] = { fundName: f.fundName, currency: f.currency, category: f.category };
    const existing = Array.isArray(prices[f.fundCode]) ? [...prices[f.fundCode]] : [];
    const byDate = new Map(existing.map((p) => [p.date, p]));
    for (const p of f.prices) {
      const prev = byDate.get(p.date);
      // Never let an automated fetch overwrite a manual correction or portal snapshot.
      if (prev && (prev.source === "manual" || prev.source === "pruservices-portal") && source !== "manual") continue;
      if (!prev || prev.navpu !== p.navpu) {
        if (!prev) added++;
        byDate.set(p.date, { date: p.date, navpu: p.navpu, source });
      }
    }
    prices[f.fundCode] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  return {
    ...store,
    holdings,
    prices,
    catalog,
    lastFetchAt: parsed.fetchedAt || new Date().toISOString(),
    lastFetchAdded: added,
  };
}

