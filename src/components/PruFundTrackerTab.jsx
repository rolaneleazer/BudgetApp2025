import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * DOCTRINE Rule 2: Strictly solid colors only (Zero CSS gradients),
 * senior-friendly high contrast (>= 7:1 AAA), minimum 44px touch targets.
 */
const PALETTE = {
  bg: "#050b16",
  card: "#0a1426",
  cardElevated: "#0f1d36",
  highContrast: "#040811",
  border: "#1e3252",
  text: "#ffffff",
  soft: "#dbeafe",
  muted: "#94a3b8",
  red: "#f87171",
  redBg: "#3b0a14",
  pruRed: "#ed1b2e",
  pruRedBg: "#3a0b12",
  amber: "#fbbf24",
  amberBg: "#3b2506",
  green: "#34d399",
  greenBg: "#062e22",
  blue: "#38bdf8",
  blueBg: "#082640",
  purple: "#c084fc",
  purpleBg: "#271042",
};

export const PRULINK_FUND_CATALOG = [
  {
    fundCode: "MONEY_MARKET_FUND",
    fundName: "PRULink Money Market Fund",
    currency: "PHP",
    category: "Conservative",
    seedPrices: [
      { date: "2026-01-15", navpu: 1.2612, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 1.2698, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 1.2774, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.2851, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 1.2923, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 1.2961, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.29885, source: "website" },
      { date: "2026-11-11", navpu: 1.29894, source: "website" },
    ],
  },
  {
    fundCode: "PESO_BOND_FUND",
    fundName: "PRULink Peso Bond Fund",
    currency: "PHP",
    category: "Conservative",
    seedPrices: [
      { date: "2026-01-15", navpu: 2.984, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 3.0125, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 3.038, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 3.0642, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 3.089, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 3.0985, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 3.1055, source: "website" },
      { date: "2026-11-11", navpu: 3.10714, source: "website" },
    ],
  },
  {
    fundCode: "CASH_FLOW_FUND_PHP_HEDGED_SHARE_CLASS",
    fundName: "PRULink Cash Flow Fund – Php Hedged Share Class",
    currency: "PHP",
    category: "Moderate",
    seedPrices: [
      { date: "2026-01-15", navpu: 0.9012, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 0.9085, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 0.914, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 0.9188, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 0.9225, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 0.9241, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 0.92541, source: "website" },
      { date: "2026-11-11", navpu: 0.92914, source: "website" },
    ],
  },
  {
    fundCode: "CASH_FLOW_FUND_PLUS_PHP_HEDGED_SHARE_CLASS",
    fundName: "PRULink Cash Flow Fund Plus – Php Hedged Share Class",
    currency: "PHP",
    category: "Moderate",
    seedPrices: [
      { date: "2026-01-15", navpu: 0.928, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 0.939, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 0.9465, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 0.94994, source: "website" },
      { date: "2026-11-11", navpu: 0.95191, source: "website" },
    ],
  },
  {
    fundCode: "MANAGED_FUND",
    fundName: "PRULink Managed Fund",
    currency: "PHP",
    category: "Moderate",
    seedPrices: [
      { date: "2026-01-15", navpu: 3.241, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 3.279, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 3.305, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 3.332, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 3.356, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 3.368, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 3.373, source: "website" },
      { date: "2026-11-11", navpu: 3.37575, source: "website" },
    ],
  },
  {
    fundCode: "FLEXI_INCOME_FUND",
    fundName: "PRULink Flexi Income Fund",
    currency: "PHP",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.052, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.071, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.08436, source: "website" },
      { date: "2026-11-11", navpu: 1.09335, source: "website" },
    ],
  },
  {
    fundCode: "STRATEGIC_INCOME_FUND_PHP_UNHEDGED_SHARE_CLASS",
    fundName: "PRULink Strategic Income Fund – Php Unhedged Share Class",
    currency: "PHP",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.038, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.051, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.06066, source: "website" },
      { date: "2026-11-11", navpu: 1.06703, source: "website" },
    ],
  },
  {
    fundCode: "PROACTIVE_FUND",
    fundName: "PRULink Proactive Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-01-15", navpu: 1.882, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 1.905, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 1.921, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.943, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 1.958, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 1.964, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.96816, source: "website" },
      { date: "2026-11-11", navpu: 1.97062, source: "website" },
    ],
  },
  {
    fundCode: "GROWTH_FUND",
    fundName: "PRULink Growth Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-01-15", navpu: 2.965, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 3.012, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 3.048, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 3.079, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 3.104, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 3.115, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 3.1209, source: "website" },
      { date: "2026-11-11", navpu: 3.12623, source: "website" },
    ],
  },
  {
    fundCode: "GLOBAL_TECH_NAVIGATOR_FUND",
    fundName: "PRULink Global Tech Navigator Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.412, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.489, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.55135, source: "website" },
      { date: "2026-11-11", navpu: 1.53355, source: "website" },
    ],
  },
  {
    fundCode: "EQUITY_INDEX_TRACKER_FUND",
    fundName: "PRULink Equity Index Tracker Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-03-15", navpu: 0.992, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.015, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.02812, source: "website" },
      { date: "2026-11-11", navpu: 1.02402, source: "website" },
    ],
  },
  {
    fundCode: "EQUITY_FUND",
    fundName: "PRULink Equity Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-01-15", navpu: 1.561, source: "fact-sheet" },
      { date: "2026-03-15", navpu: 1.584, source: "fact-sheet" },
      { date: "2026-05-15", navpu: 1.599, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.618, source: "fact-sheet" },
      { date: "2026-09-15", navpu: 1.631, source: "fact-sheet" },
      { date: "2026-10-15", navpu: 1.639, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.64208, source: "website" },
      { date: "2026-11-11", navpu: 1.64538, source: "website" },
    ],
  },
  {
    fundCode: "GLOBAL_MARKET_NAVIGATOR_FUND",
    fundName: "PRULink Global Market Navigator Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.495, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.538, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.56479, source: "website" },
      { date: "2026-11-11", navpu: 1.57469, source: "website" },
    ],
  },
  {
    fundCode: "GLOBAL_EQUITY_NAVIGATOR_FUND",
    fundName: "PRULink Global Equity Navigator Fund",
    currency: "PHP",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.502, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.549, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.58263, source: "website" },
      { date: "2026-11-11", navpu: 1.59777, source: "website" },
    ],
  },
  {
    fundCode: "DOLLAR_BOND_FUND",
    fundName: "PRULink Dollar Bond Fund",
    currency: "USD",
    category: "Conservative",
    seedPrices: [
      { date: "2026-03-15", navpu: 2.521, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 2.564, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 2.5983, source: "website" },
      { date: "2026-11-11", navpu: 2.5836, source: "website" },
    ],
  },
  {
    fundCode: "ASIAN_LOCAL_BOND_FUND",
    fundName: "PRULink Asian Local Bond Fund",
    currency: "USD",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.078, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.092, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.10402, source: "website" },
      { date: "2026-11-11", navpu: 1.09991, source: "website" },
    ],
  },
  {
    fundCode: "CASH_FLOW_FUND_USD_SHARE_CLASS",
    fundName: "PRULink Cash Flow Fund – USD Share Class",
    currency: "USD",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 0.769, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 0.778, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 0.78403, source: "website" },
      { date: "2026-11-11", navpu: 0.78553, source: "website" },
    ],
  },
  {
    fundCode: "CASH_FLOW_FUND_PLUS_USD_SHARE_CLASS",
    fundName: "PRULink Cash Flow Fund Plus – USD Share Class",
    currency: "USD",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 0.961, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 0.969, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 0.97588, source: "website" },
      { date: "2026-11-11", navpu: 0.97609, source: "website" },
    ],
  },
  {
    fundCode: "ASIAN_BALANCED_FUND",
    fundName: "PRULink Asian Balanced Fund",
    currency: "USD",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.231, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.249, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.26238, source: "website" },
      { date: "2026-11-11", navpu: 1.26787, source: "website" },
    ],
  },
  {
    fundCode: "STRATEGIC_INCOME_FUND_USD_SHARE_CLASS",
    fundName: "PRULink Strategic Income Fund – USD Share Class",
    currency: "USD",
    category: "Moderate",
    seedPrices: [
      { date: "2026-03-15", navpu: 0.995, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.004, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.01172, source: "website" },
      { date: "2026-11-11", navpu: 1.0126, source: "website" },
    ],
  },
  {
    fundCode: "ASIA_PACIFIC_EQUITY_FUND",
    fundName: "PRULink Asia Pacific Equity Fund",
    currency: "USD",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.585, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.622, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.64506, source: "website" },
      { date: "2026-11-11", navpu: 1.66098, source: "website" },
    ],
  },
  {
    fundCode: "GLOBAL_EMERGING_MARKETS_DYNAMIC_FUND",
    fundName: "PRULink Global Emerging Markets Dynamic Fund",
    currency: "USD",
    category: "Aggressive",
    seedPrices: [
      { date: "2026-03-15", navpu: 1.682, source: "fact-sheet" },
      { date: "2026-07-15", navpu: 1.719, source: "fact-sheet" },
      { date: "2026-11-10", navpu: 1.7466, source: "website" },
      { date: "2026-11-11", navpu: 1.75937, source: "website" },
    ],
  },
];

const POLICY_TYPES = [
  "PRULink Assurance Account Plus (PAA+)",
  "PRULink Exact Protector",
  "PRULink Elite Protector",
  "PRUMillionaire",
  "PRULife Your Term (with Rider)",
  "Other PRULink VUL Policy",
];

const MONTHS_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function normalizeDateInput(raw) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})$/);
  if (m) {
    const mon = MONTHS_MAP[m[2].toLowerCase()];
    if (!mon) return null;
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${mon}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    return `${slash[1]}-${String(Number(slash[2])).padStart(2, "0")}-${String(Number(slash[3])).padStart(2, "0")}`;
  }
  return null;
}

function fmtMoney(val, currency = "PHP", decimals = 2) {
  const n = Number(val || 0);
  const sym = currency === "USD" ? "$" : "₱";
  return `${sym}${n.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function solidBtnStyle({ bg = PALETTE.cardElevated, fg = PALETTE.text, border = PALETTE.border, disabled = false }) {
  return {
    minHeight: 44,
    padding: "10px 16px",
    borderRadius: 8,
    backgroundColor: disabled ? "#111b2e" : bg,
    color: disabled ? PALETTE.muted : fg,
    border: `2px solid ${disabled ? PALETTE.border : border}`,
    fontSize: 13,
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

export default function PruFundTrackerTab({
  budgetData = {},
  setBudgetData,
  session,
  sm = false,
  canUpdate = true,
}) {
  const pruStore = budgetData?.pruFunds || {};

  // Merge built-in seed prices with user's stored prices
  const mergedPricesByFund = useMemo(() => {
    const out = {};
    const storedPrices = pruStore.prices || {};
    for (const item of PRULINK_FUND_CATALOG) {
      const byDate = new Map();
      for (const sp of item.seedPrices || []) {
        byDate.set(sp.date, { ...sp });
      }
      for (const up of storedPrices[item.fundCode] || []) {
        if (up?.date && Number(up.navpu) > 0) {
          byDate.set(up.date, { date: up.date, navpu: Number(up.navpu), source: up.source || "website" });
        }
      }
      out[item.fundCode] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    }
    return out;
  }, [pruStore.prices]);

  const holdings = useMemo(() => {
    return Array.isArray(pruStore.holdings) ? pruStore.holdings : [];
  }, [pruStore.holdings]);

  const unitEvents = useMemo(() => {
    return Array.isArray(pruStore.unitEvents) ? pruStore.unitEvents : [];
  }, [pruStore.unitEvents]);

  const [selectedFundCode, setSelectedFundCode] = useState(
    () => holdings[0]?.fundCode || "EQUITY_FUND"
  );
  const [chartMode, setChartMode] = useState("navpu"); // "navpu" | "value"
  const [rangeFilter, setRangeFilter] = useState("ALL"); // "1M" | "3M" | "YTD" | "1Y" | "ALL"
  const [fetchingLive, setFetchingLive] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null);

  // Modals
  const [holdingModalOpen, setHoldingModalOpen] = useState(false);
  const [editingHoldingId, setEditingHoldingId] = useState(null);
  const [holdingForm, setHoldingForm] = useState({
    fundCode: "EQUITY_FUND",
    policyType: POLICY_TYPES[0],
    policyNo: "",
    units: "",
    totalPremiumsPaid: "",
    asOf: new Date().toISOString().slice(0, 10),
  });

  const [unitEventModalOpen, setUnitEventModalOpen] = useState(false);
  const [unitEventForm, setUnitEventForm] = useState({
    holdingId: "",
    type: "TOP_UP", // "TOP_UP" | "CHARGE" | "WITHDRAWAL"
    unitsDelta: "",
    premiumAdded: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const [backfillModalOpen, setBackfillModalOpen] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualNavpu, setManualNavpu] = useState("");
  const [bulkCsvText, setBulkCsvText] = useState("");

  const selectedFundMeta = useMemo(() => {
    return (
      PRULINK_FUND_CATALOG.find((f) => f.fundCode === selectedFundCode) ||
      PRULINK_FUND_CATALOG[0]
    );
  }, [selectedFundCode]);

  const selectedHolding = useMemo(() => {
    return holdings.find((h) => h.fundCode === selectedFundCode) || null;
  }, [holdings, selectedFundCode]);

  // Enrich all holdings with latest NAVPU, current value, daily change, and net gain/loss
  const enrichedHoldings = useMemo(() => {
    return holdings.map((h) => {
      const meta = PRULINK_FUND_CATALOG.find((f) => f.fundCode === h.fundCode);
      const series = mergedPricesByFund[h.fundCode] || [];
      const latest = series.length > 0 ? series[series.length - 1] : null;
      const prev = series.length > 1 ? series[series.length - 2] : null;
      const navpu = Number(latest?.navpu || 0);
      const prevNavpu = prev ? Number(prev.navpu) : navpu;
      const units = Number(h.units || 0);
      const currentValue = units * navpu;
      const prevValue = units * prevNavpu;
      const dayChangeVal = currentValue - prevValue;
      const dayChangePct = prevNavpu > 0 ? ((navpu - prevNavpu) / prevNavpu) * 100 : 0;
      const premiums = Number(h.totalPremiumsPaid || 0);
      const gainLossVal = premiums > 0 ? currentValue - premiums : null;
      const gainLossPct = premiums > 0 ? ((currentValue - premiums) / premiums) * 100 : null;

      return {
        ...h,
        fundName: meta?.fundName || h.fundName || h.fundCode,
        currency: meta?.currency || h.currency || "PHP",
        category: meta?.category || "Moderate",
        latestNavpu: navpu,
        latestDate: latest?.date || h.asOf || "—",
        prevNavpu,
        currentValue,
        dayChangeVal,
        dayChangePct,
        premiums,
        gainLossVal,
        gainLossPct,
      };
    });
  }, [holdings, mergedPricesByFund]);

  const portfolioSummary = useMemo(() => {
    let phpValue = 0;
    let phpPremiums = 0;
    let phpDayChange = 0;
    let usdValue = 0;
    let usdPremiums = 0;
    let usdDayChange = 0;

    for (const h of enrichedHoldings) {
      if (h.currency === "USD") {
        usdValue += h.currentValue;
        usdPremiums += h.premiums;
        usdDayChange += h.dayChangeVal;
      } else {
        phpValue += h.currentValue;
        phpPremiums += h.premiums;
        phpDayChange += h.dayChangeVal;
      }
    }

    return {
      phpValue,
      phpPremiums,
      phpGainLoss: phpPremiums > 0 ? phpValue - phpPremiums : null,
      phpGainPct: phpPremiums > 0 ? ((phpValue - phpPremiums) / phpPremiums) * 100 : null,
      phpDayChange,
      usdValue,
      usdPremiums,
      usdGainLoss: usdPremiums > 0 ? usdValue - usdPremiums : null,
      usdDayChange,
    };
  }, [enrichedHoldings]);

  // Filter selected fund's historical series by rangeFilter
  const filteredSeries = useMemo(() => {
    const full = mergedPricesByFund[selectedFundCode] || [];
    if (full.length === 0) return [];
    const latestDateStr = full[full.length - 1].date;
    const latestDate = new Date(latestDateStr + "T00:00:00Z");

    let cutoff = null;
    if (rangeFilter === "1M") {
      cutoff = new Date(latestDate);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 1);
    } else if (rangeFilter === "3M") {
      cutoff = new Date(latestDate);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
    } else if (rangeFilter === "YTD") {
      cutoff = new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));
    } else if (rangeFilter === "1Y") {
      cutoff = new Date(latestDate);
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    }

    const cutoffIso = cutoff ? cutoff.toISOString().slice(0, 10) : null;
    const units = Number(selectedHolding?.units || 0);

    return full
      .filter((pt) => !cutoffIso || pt.date >= cutoffIso)
      .map((pt) => ({
        date: pt.date,
        navpu: Number(pt.navpu),
        fundValue: Number((units * Number(pt.navpu)).toFixed(2)),
        source: pt.source || "website",
      }));
  }, [mergedPricesByFund, selectedFundCode, rangeFilter, selectedHolding]);

  const seriesStats = useMemo(() => {
    if (filteredSeries.length === 0) {
      return { latest: 0, first: 0, high: 0, highDate: "—", low: 0, lowDate: "—", changePct: 0 };
    }
    let high = filteredSeries[0].navpu;
    let highDate = filteredSeries[0].date;
    let low = filteredSeries[0].navpu;
    let lowDate = filteredSeries[0].date;

    for (const pt of filteredSeries) {
      if (pt.navpu >= high) {
        high = pt.navpu;
        highDate = pt.date;
      }
      if (pt.navpu <= low) {
        low = pt.navpu;
        lowDate = pt.date;
      }
    }
    const first = filteredSeries[0].navpu;
    const latest = filteredSeries[filteredSeries.length - 1].navpu;
    const changePct = first > 0 ? ((latest - first) / first) * 100 : 0;
    return { latest, first, high, highDate, low, lowDate, changePct };
  }, [filteredSeries]);

  const updatePruStore = (updater) => {
    if (!setBudgetData) return;
    setBudgetData((prev) => {
      const cur = prev?.pruFunds || {};
      const next = typeof updater === "function" ? updater(cur) : updater;
      return {
        ...prev,
        pruFunds: next,
      };
    });
  };

  // Trigger live fetch from prulifeuk.com.ph via /api/schedules?action=pru_prices
  const handleFetchLatestPrices = async () => {
    setFetchingLive(true);
    setStatusBanner(null);
    try {
      const headers = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/schedules?action=pru_prices", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to fetch Pru Life UK prices");
      }

      const incomingFunds = Array.isArray(data.funds) ? data.funds : [];
      updatePruStore((cur) => {
        const nextPrices = { ...(cur.prices || {}) };
        const nextCatalog = { ...(cur.catalog || {}) };
        for (const f of incomingFunds) {
          nextCatalog[f.fundCode] = {
            fundName: f.fundName,
            currency: f.currency,
            category: f.category,
          };
          const existing = Array.isArray(nextPrices[f.fundCode]) ? [...nextPrices[f.fundCode]] : [];
          const byDate = new Map(existing.map((p) => [p.date, p]));
          for (const p of f.prices || []) {
            const prev = byDate.get(p.date);
            if (prev && prev.source === "manual") continue;
            byDate.set(p.date, {
              date: p.date,
              navpu: Number(p.navpu),
              source: data.liveFetch ? "website" : "seed",
            });
          }
          nextPrices[f.fundCode] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        }
        return {
          ...cur,
          prices: nextPrices,
          catalog: nextCatalog,
          lastFetchAt: data.fetchedAt || new Date().toISOString(),
        };
      });

      setStatusBanner({
        tone: PALETTE.green,
        bg: PALETTE.greenBg,
        text: data.liveFetch
          ? `✅ Synced ${incomingFunds.length} PRULink funds from prulifeuk.com.ph (Valuation dates: ${(data.dates || []).join(", ")}).`
          : `ℹ️ Loaded ${incomingFunds.length} PRULink baseline fund prices (${data.fallbackReason || "offline mode"}).`,
      });
    } catch (err) {
      setStatusBanner({
        tone: PALETTE.amber,
        bg: PALETTE.amberBg,
        text: `⚠️ Could not reach live endpoint (${err.message}). Built-in PRULink prices remain active and you can add/import prices manually.`,
      });
    } finally {
      setFetchingLive(false);
    }
  };

  // Save holding (Add or Edit)
  const handleSaveHolding = () => {
    const unitsNum = Number(holdingForm.units);
    if (!holdingForm.fundCode || isNaN(unitsNum) || unitsNum <= 0) {
      setStatusBanner({
        tone: PALETTE.red,
        bg: PALETTE.redBg,
        text: "Please enter a valid positive number of units from your Pulse app or Statement of Account.",
      });
      return;
    }

    const meta = PRULINK_FUND_CATALOG.find((f) => f.fundCode === holdingForm.fundCode);
    const entry = {
      id: editingHoldingId || `pru_hold_${Date.now()}`,
      fundCode: holdingForm.fundCode,
      fundName: meta?.fundName || holdingForm.fundCode,
      currency: meta?.currency || "PHP",
      policyType: holdingForm.policyType || POLICY_TYPES[0],
      policyNo: String(holdingForm.policyNo || "").trim(),
      units: Number(unitsNum.toFixed(6)),
      totalPremiumsPaid: Number(holdingForm.totalPremiumsPaid || 0),
      asOf: holdingForm.asOf || new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    };

    updatePruStore((cur) => {
      const prevList = Array.isArray(cur.holdings) ? cur.holdings : [];
      const exists = prevList.some((h) => h.id === entry.id);
      const nextHoldings = exists
        ? prevList.map((h) => (h.id === entry.id ? entry : h))
        : [...prevList, entry];
      return {
        ...cur,
        holdings: nextHoldings,
      };
    });

    setSelectedFundCode(entry.fundCode);
    setHoldingModalOpen(false);
    setEditingHoldingId(null);
    setStatusBanner({
      tone: PALETTE.green,
      bg: PALETTE.greenBg,
      text: `✅ Saved holding for ${entry.fundName} (${entry.units.toLocaleString()} units).`,
    });
  };

  const handleDeleteHolding = (id) => {
    updatePruStore((cur) => ({
      ...cur,
      holdings: (cur.holdings || []).filter((h) => h.id !== id),
    }));
  };

  // Record unit event (Top-up, Charge deduction, or Withdrawal)
  const handleSaveUnitEvent = () => {
    const targetHolding = holdings.find((h) => h.id === unitEventForm.holdingId) || holdings[0];
    const deltaAbs = Math.abs(Number(unitEventForm.unitsDelta || 0));
    if (!targetHolding || !deltaAbs) return;

    const signedDelta =
      unitEventForm.type === "CHARGE" || unitEventForm.type === "WITHDRAWAL"
        ? -deltaAbs
        : deltaAbs;
    const premDelta = Number(unitEventForm.premiumAdded || 0);

    const eventRecord = {
      id: `uev_${Date.now()}`,
      holdingId: targetHolding.id,
      fundCode: targetHolding.fundCode,
      fundName: targetHolding.fundName,
      type: unitEventForm.type,
      unitsDelta: Number(signedDelta.toFixed(6)),
      premiumAdded: premDelta,
      date: unitEventForm.date || new Date().toISOString().slice(0, 10),
      note: String(unitEventForm.note || "").trim(),
    };

    updatePruStore((cur) => {
      const nextHoldings = (cur.holdings || []).map((h) => {
        if (h.id !== targetHolding.id) return h;
        return {
          ...h,
          units: Math.max(0, Number((Number(h.units || 0) + signedDelta).toFixed(6))),
          totalPremiumsPaid: Math.max(0, Number(h.totalPremiumsPaid || 0) + premDelta),
          asOf: eventRecord.date,
        };
      });
      const prevEvents = Array.isArray(cur.unitEvents) ? cur.unitEvents : [];
      return {
        ...cur,
        holdings: nextHoldings,
        unitEvents: [eventRecord, ...prevEvents].slice(0, 100),
      };
    });

    setUnitEventModalOpen(false);
    setStatusBanner({
      tone: PALETTE.green,
      bg: PALETTE.greenBg,
      text: `✅ Logged ${unitEventForm.type} (${signedDelta > 0 ? "+" : ""}${signedDelta} units) on ${targetHolding.fundName}.`,
    });
  };

  // Add single manual historical NAVPU
  const handleAddManualPrice = () => {
    const normDate = normalizeDateInput(manualDate);
    const navpuNum = Number(manualNavpu);
    if (!normDate || isNaN(navpuNum) || navpuNum <= 0) {
      setStatusBanner({
        tone: PALETTE.red,
        bg: PALETTE.redBg,
        text: "Please enter a valid date (YYYY-MM-DD) and positive NAVPU unit price.",
      });
      return;
    }

    updatePruStore((cur) => {
      const nextPrices = { ...(cur.prices || {}) };
      const existing = Array.isArray(nextPrices[selectedFundCode]) ? [...nextPrices[selectedFundCode]] : [];
      const byDate = new Map(existing.map((p) => [p.date, p]));
      byDate.set(normDate, { date: normDate, navpu: Number(navpuNum.toFixed(6)), source: "manual" });
      nextPrices[selectedFundCode] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      return { ...cur, prices: nextPrices };
    });

    setManualNavpu("");
    setStatusBanner({
      tone: PALETTE.green,
      bg: PALETTE.greenBg,
      text: `✅ Added NAVPU ${navpuNum} on ${normDate} for ${selectedFundMeta.fundName}.`,
    });
  };

  // Bulk CSV / text import
  const handleBulkCsvImport = () => {
    const lines = String(bulkCsvText || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsedRows = [];
    for (const line of lines) {
      const parts = line.split(/[,;\t]+/).map((s) => s.trim());
      if (parts.length < 2) continue;
      const d = normalizeDateInput(parts[0]);
      const v = Number(parts[1]);
      if (d && !isNaN(v) && v > 0) {
        parsedRows.push({ date: d, navpu: Number(v.toFixed(6)), source: "manual" });
      }
    }

    if (parsedRows.length === 0) {
      setStatusBanner({
        tone: PALETTE.red,
        bg: PALETTE.redBg,
        text: "No valid 'Date, NAVPU' rows found. Example: 2026-08-15, 1.6250",
      });
      return;
    }

    updatePruStore((cur) => {
      const nextPrices = { ...(cur.prices || {}) };
      const existing = Array.isArray(nextPrices[selectedFundCode]) ? [...nextPrices[selectedFundCode]] : [];
      const byDate = new Map(existing.map((p) => [p.date, p]));
      for (const r of parsedRows) {
        byDate.set(r.date, r);
      }
      nextPrices[selectedFundCode] = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      return { ...cur, prices: nextPrices };
    });

    setBulkCsvText("");
    setBackfillModalOpen(false);
    setStatusBanner({
      tone: PALETTE.green,
      bg: PALETTE.greenBg,
      text: `✅ Imported ${parsedRows.length} historical NAVPU data point(s) into ${selectedFundMeta.fundName}.`,
    });
  };

  // Export CSV
  const handleExportCsv = () => {
    const units = Number(selectedHolding?.units || 0);
    const header = "Date,FundCode,FundName,Currency,NAVPU,UnitsHeld,FundValue,Source\n";
    const rows = filteredSeries
      .map(
        (pt) =>
          `${pt.date},${selectedFundMeta.fundCode},"${selectedFundMeta.fundName}",${selectedFundMeta.currency},${pt.navpu},${units},${(units * pt.navpu).toFixed(2)},${pt.source}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prulink_${selectedFundMeta.fundCode.toLowerCase()}_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ color: PALETTE.text }}>
      {/* ── Top Module Header Card ── */}
      <div
        style={{
          backgroundColor: PALETTE.card,
          border: `2px solid ${PALETTE.pruRed}`,
          borderRadius: 12,
          padding: sm ? 16 : 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span
                style={{
                  backgroundColor: PALETTE.pruRedBg,
                  color: "#ffffff",
                  border: `2px solid ${PALETTE.pruRed}`,
                  padding: "4px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                🛡️ PRU LIFE UK (PH)
              </span>
              <h2 style={{ margin: 0, fontSize: sm ? 20 : 24, fontWeight: 900, color: PALETTE.text }}>
                PRULink Life Insurance Fund Value & NAVPU Tracker
              </h2>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: PALETTE.soft, lineHeight: 1.5 }}>
              Track daily & historical <strong>Net Asset Value Per Unit (NAVPU)</strong> across all 22 official PRULink Peso & Dollar funds, and compute your exact policy <strong>Fund Value = Units × NAVPU</strong>.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={fetchingLive}
              onClick={handleFetchLatestPrices}
              style={solidBtnStyle({
                bg: PALETTE.blueBg,
                fg: PALETTE.text,
                border: PALETTE.blue,
                disabled: fetchingLive,
              })}
            >
              {fetchingLive ? "⏳ Fetching prulifeuk.com.ph…" : "🔄 Fetch Latest Pru Life Prices"}
            </button>
            {canUpdate && (
              <button
                type="button"
                onClick={() => {
                  setEditingHoldingId(null);
                  setHoldingForm({
                    fundCode: selectedFundCode,
                    policyType: POLICY_TYPES[0],
                    policyNo: "",
                    units: "",
                    totalPremiumsPaid: "",
                    asOf: new Date().toISOString().slice(0, 10),
                  });
                  setHoldingModalOpen(true);
                }}
                style={solidBtnStyle({
                  bg: PALETTE.greenBg,
                  fg: PALETTE.text,
                  border: PALETTE.green,
                })}
              >
                ➕ Add My Policy Fund Units
              </button>
            )}
            <button
              type="button"
              onClick={() => setBackfillModalOpen(true)}
              style={solidBtnStyle({
                bg: PALETTE.cardElevated,
                fg: PALETTE.soft,
                border: PALETTE.border,
              })}
            >
              📥 Add / Import Historical NAVPU
            </button>
          </div>
        </div>

        {pruStore.lastFetchAt && (
          <div style={{ marginTop: 10, fontSize: 12, color: PALETTE.muted }}>
            Last price sync: <strong style={{ color: PALETTE.soft }}>{new Date(pruStore.lastFetchAt).toLocaleString()}</strong> · Source:{" "}
            <span style={{ color: PALETTE.blue }}>prulifeuk.com.ph/en/products/investment/prulink-funds/</span>
          </div>
        )}
      </div>

      {/* ── Status Feedback Banner ── */}
      {statusBanner && (
        <div
          style={{
            backgroundColor: statusBanner.bg,
            border: `2px solid ${statusBanner.tone}`,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.text }}>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            style={{
              minHeight: 36,
              padding: "4px 10px",
              borderRadius: 6,
              backgroundColor: PALETTE.highContrast,
              color: PALETTE.text,
              border: `1px solid ${statusBanner.tone}`,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── KPI Summary Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: sm ? "1fr" : "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `2px solid ${PALETTE.green}`,
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.muted, textTransform: "uppercase" }}>
            Total Policy Fund Value (PHP)
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: PALETTE.text, marginTop: 6 }}>
            {fmtMoney(portfolioSummary.phpValue, "PHP")}
          </div>
          <div style={{ fontSize: 12, color: portfolioSummary.phpDayChange >= 0 ? PALETTE.green : PALETTE.red, marginTop: 4, fontWeight: 700 }}>
            {portfolioSummary.phpDayChange >= 0 ? "▲ +" : "▼ "}
            {fmtMoney(portfolioSummary.phpDayChange, "PHP")} latest day change
          </div>
        </div>

        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `2px solid ${
              portfolioSummary.phpGainLoss == null
                ? PALETTE.border
                : portfolioSummary.phpGainLoss >= 0
                ? PALETTE.green
                : PALETTE.red
            }`,
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.muted, textTransform: "uppercase" }}>
            Net Gain / Loss vs Premiums Paid
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color:
                portfolioSummary.phpGainLoss == null
                  ? PALETTE.soft
                  : portfolioSummary.phpGainLoss >= 0
                  ? PALETTE.green
                  : PALETTE.red,
              marginTop: 6,
            }}
          >
            {portfolioSummary.phpGainLoss == null
              ? "Set Premiums"
              : `${portfolioSummary.phpGainLoss >= 0 ? "+" : ""}${fmtMoney(portfolioSummary.phpGainLoss, "PHP")}`}
          </div>
          <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 4 }}>
            Premiums Paid: {fmtMoney(portfolioSummary.phpPremiums, "PHP")}
            {portfolioSummary.phpGainPct != null ? ` (${portfolioSummary.phpGainPct.toFixed(2)}%)` : ""}
          </div>
        </div>

        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `2px solid ${PALETTE.blue}`,
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.muted, textTransform: "uppercase" }}>
            USD Dollar Policy Value
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: PALETTE.text, marginTop: 6 }}>
            {fmtMoney(portfolioSummary.usdValue, "USD")}
          </div>
          <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 4 }}>
            Across {enrichedHoldings.filter((h) => h.currency === "USD").length} USD PRULink holding(s)
          </div>
        </div>

        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `2px solid ${PALETTE.amber}`,
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.muted, textTransform: "uppercase" }}>
            Official PRULink Funds Tracked
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: PALETTE.text, marginTop: 6 }}>
            {PRULINK_FUND_CATALOG.length} Funds
          </div>
          <div style={{ fontSize: 12, color: PALETTE.soft, marginTop: 4 }}>
            {holdings.length} policy holding(s) configured
          </div>
        </div>
      </div>

      {/* ── My Policy Holdings Section ── */}
      <div
        style={{
          backgroundColor: PALETTE.card,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: PALETTE.text }}>
              💼 My PRULink Policy Holdings (Units × Latest NAVPU)
            </h3>
            <div style={{ fontSize: 12, color: PALETTE.muted, marginTop: 2 }}>
              Click any holding card to load its historical NAVPU & Fund Value chart below.
            </div>
          </div>

          {holdings.length > 0 && canUpdate && (
            <button
              type="button"
              onClick={() => {
                setUnitEventForm({
                  holdingId: holdings[0].id,
                  type: "TOP_UP",
                  unitsDelta: "",
                  premiumAdded: "",
                  date: new Date().toISOString().slice(0, 10),
                  note: "",
                });
                setUnitEventModalOpen(true);
              }}
              style={solidBtnStyle({
                bg: PALETTE.amberBg,
                fg: PALETTE.text,
                border: PALETTE.amber,
              })}
            >
              📝 Log Top-Up / Monthly Charge / Withdrawal
            </button>
          )}
        </div>

        {enrichedHoldings.length === 0 ? (
          <div
            style={{
              backgroundColor: PALETTE.highContrast,
              border: `1px dashed ${PALETTE.border}`,
              borderRadius: 10,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: PALETTE.text }}>
              No Policy Units Entered Yet
            </div>
            <p style={{ fontSize: 13, color: PALETTE.muted, maxWidth: 620, margin: "6px auto 14px" }}>
              Open your <strong>Pulse by Prudential</strong> app or latest <strong>Statement of Account (SOA)</strong>, find your{" "}
              <em>Number of Units</em> and <em>PRULink Fund Name</em>, and click below to track your live policy fund value.
            </p>
            {canUpdate && (
              <button
                type="button"
                onClick={() => setHoldingModalOpen(true)}
                style={solidBtnStyle({ bg: PALETTE.greenBg, fg: PALETTE.text, border: PALETTE.green })}
              >
                ➕ Enter My First PRULink Fund Holding
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: sm ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {enrichedHoldings.map((h) => {
              const active = h.fundCode === selectedFundCode;
              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedFundCode(h.fundCode)}
                  style={{
                    backgroundColor: active ? PALETTE.cardElevated : PALETTE.highContrast,
                    border: `2px solid ${active ? PALETTE.blue : PALETTE.border}`,
                    borderRadius: 10,
                    padding: 14,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          padding: "2px 8px",
                          borderRadius: 6,
                          backgroundColor: PALETTE.blueBg,
                          color: PALETTE.blue,
                          border: `1px solid ${PALETTE.blue}`,
                        }}
                      >
                        {h.policyType}
                      </span>
                      <div style={{ fontSize: 15, fontWeight: 900, color: PALETTE.text, marginTop: 6 }}>
                        {h.fundName}
                      </div>
                      {h.policyNo && (
                        <div style={{ fontSize: 11, color: PALETTE.muted }}>Policy: {h.policyNo}</div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 6,
                        backgroundColor: PALETTE.card,
                        color: PALETTE.soft,
                        border: `1px solid ${PALETTE.border}`,
                      }}
                    >
                      {h.category}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: `1px solid ${PALETTE.border}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: PALETTE.muted }}>Current Fund Value</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: PALETTE.green }}>
                        {fmtMoney(h.currentValue, h.currency)}
                      </div>
                      <div style={{ fontSize: 11, color: h.dayChangePct >= 0 ? PALETTE.green : PALETTE.red, fontWeight: 700 }}>
                        {h.dayChangePct >= 0 ? "+" : ""}
                        {h.dayChangePct.toFixed(2)}% ({fmtMoney(h.dayChangeVal, h.currency)})
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: PALETTE.muted }}>Units × Latest NAVPU</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: PALETTE.text, marginTop: 2 }}>
                        {h.units.toLocaleString("en-PH", { maximumFractionDigits: 4 })} units
                      </div>
                      <div style={{ fontSize: 12, color: PALETTE.blue, fontWeight: 800 }}>
                        @ {fmtMoney(h.latestNavpu, h.currency, 5)} ({h.latestDate})
                      </div>
                    </div>
                  </div>

                  {h.gainLossVal != null && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "6px 10px",
                        borderRadius: 6,
                        backgroundColor: h.gainLossVal >= 0 ? PALETTE.greenBg : PALETTE.redBg,
                        fontSize: 12,
                        fontWeight: 800,
                        color: h.gainLossVal >= 0 ? PALETTE.green : PALETTE.red,
                      }}
                    >
                       vs Premiums ({fmtMoney(h.premiums, h.currency)}):{" "}
                      {h.gainLossVal >= 0 ? "+" : ""}
                      {fmtMoney(h.gainLossVal, h.currency)} ({h.gainLossPct.toFixed(2)}%)
                    </div>
                  )}

                  {canUpdate && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingHoldingId(h.id);
                          setHoldingForm({
                            fundCode: h.fundCode,
                            policyType: h.policyType || POLICY_TYPES[0],
                            policyNo: h.policyNo || "",
                            units: String(h.units),
                            totalPremiumsPaid: String(h.premiums || ""),
                            asOf: h.asOf || new Date().toISOString().slice(0, 10),
                          });
                          setHoldingModalOpen(true);
                        }}
                        style={{
                          minHeight: 44,
                          padding: "6px 12px",
                          borderRadius: 6,
                          backgroundColor: PALETTE.card,
                          color: PALETTE.soft,
                          border: `1px solid ${PALETTE.border}`,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        ✏️ Edit Units
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteHolding(h.id);
                        }}
                        style={{
                          minHeight: 44,
                          padding: "6px 12px",
                          borderRadius: 6,
                          backgroundColor: PALETTE.redBg,
                          color: PALETTE.red,
                          border: `1px solid ${PALETTE.red}`,
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Interactive Historical Price & Fund Value Chart ── */}
      <div
        style={{
          backgroundColor: PALETTE.card,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ flex: "1 1 280px" }}>
            <label
              htmlFor="pru-fund-select"
              style={{ fontSize: 11, fontWeight: 800, color: PALETTE.muted, textTransform: "uppercase", display: "block", marginBottom: 4 }}
            >
              Inspect PRULink Fund Historical Series (All 22 Official Funds):
            </label>
            <select
              id="pru-fund-select"
              value={selectedFundCode}
              onChange={(e) => setSelectedFundCode(e.target.value)}
              style={{
                width: "100%",
                minHeight: 44,
                backgroundColor: PALETTE.highContrast,
                color: PALETTE.text,
                border: `2px solid ${PALETTE.blue}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                fontWeight: 800,
              }}
            >
              {PRULINK_FUND_CATALOG.map((f) => (
                <option key={f.fundCode} value={f.fundCode}>
                  [{f.currency} · {f.category}] {f.fundName}
                </option>
              ))}
            </select>
          </div>

          {/* Chart Mode & Range Controls */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setChartMode("navpu")}
              style={solidBtnStyle({
                bg: chartMode === "navpu" ? PALETTE.blueBg : PALETTE.highContrast,
                fg: PALETTE.text,
                border: chartMode === "navpu" ? PALETTE.blue : PALETTE.border,
              })}
            >
              📈 NAVPU Unit Price
            </button>
            <button
              type="button"
              onClick={() => setChartMode("value")}
              style={solidBtnStyle({
                bg: chartMode === "value" ? PALETTE.greenBg : PALETTE.highContrast,
                fg: PALETTE.text,
                border: chartMode === "value" ? PALETTE.green : PALETTE.border,
              })}
            >
              💰 My Fund Value
            </button>

            {["1M", "3M", "YTD", "1Y", "ALL"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRangeFilter(r)}
                style={{
                  minHeight: 44,
                  padding: "8px 12px",
                  borderRadius: 8,
                  backgroundColor: rangeFilter === r ? PALETTE.amberBg : PALETTE.highContrast,
                  color: rangeFilter === r ? PALETTE.amber : PALETTE.soft,
                  border: `2px solid ${rangeFilter === r ? PALETTE.amber : PALETTE.border}`,
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {r}
              </button>
            ))}

            <button
              type="button"
              onClick={handleExportCsv}
              style={solidBtnStyle({
                bg: PALETTE.highContrast,
                fg: PALETTE.soft,
                border: PALETTE.border,
              })}
            >
              ⬇️ Export CSV
            </button>
          </div>
        </div>

        {/* Milestone Stats Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: sm ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ backgroundColor: PALETTE.highContrast, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: PALETTE.muted }}>Latest NAVPU</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: PALETTE.blue, marginTop: 2 }}>
              {fmtMoney(seriesStats.latest, selectedFundMeta.currency, 5)}
            </div>
          </div>
          <div style={{ backgroundColor: PALETTE.highContrast, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: PALETTE.muted }}>Period Change ({rangeFilter})</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: seriesStats.changePct >= 0 ? PALETTE.green : PALETTE.red,
                marginTop: 2,
              }}
            >
              {seriesStats.changePct >= 0 ? "+" : ""}
              {seriesStats.changePct.toFixed(2)}%
            </div>
          </div>
          <div style={{ backgroundColor: PALETTE.highContrast, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: PALETTE.muted }}>Highest NAVPU ({seriesStats.highDate})</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: PALETTE.green, marginTop: 2 }}>
              {fmtMoney(seriesStats.high, selectedFundMeta.currency, 5)}
            </div>
          </div>
          <div style={{ backgroundColor: PALETTE.highContrast, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: PALETTE.muted }}>Lowest NAVPU ({seriesStats.lowDate})</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: PALETTE.amber, marginTop: 2 }}>
              {fmtMoney(seriesStats.low, selectedFundMeta.currency, 5)}
            </div>
          </div>
        </div>

        {chartMode === "value" && !selectedHolding && (
          <div
            style={{
              backgroundColor: PALETTE.amberBg,
              border: `1px solid ${PALETTE.amber}`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 13,
              color: PALETTE.text,
            }}
          >
            ℹ️ You haven't entered policy units for <strong>{selectedFundMeta.fundName}</strong> yet. Add your units above to plot your personal ₱/$ Fund Value curve.
          </div>
        )}

        <div style={{ height: 300, width: "100%", backgroundColor: PALETTE.highContrast, borderRadius: 10, padding: "12px 8px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
              <XAxis dataKey="date" stroke={PALETTE.muted} fontSize={12} />
              <YAxis
                stroke={PALETTE.muted}
                fontSize={12}
                domain={["auto", "auto"]}
                tickFormatter={(v) =>
                  chartMode === "value"
                    ? fmtMoney(v, selectedFundMeta.currency, 0)
                    : Number(v).toFixed(4)
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: PALETTE.cardElevated,
                  border: `2px solid ${PALETTE.blue}`,
                  borderRadius: 8,
                  color: PALETTE.text,
                  fontWeight: 800,
                }}
                formatter={(val) =>
                  chartMode === "value"
                    ? [fmtMoney(val, selectedFundMeta.currency, 2), "My Fund Value"]
                    : [fmtMoney(val, selectedFundMeta.currency, 5), "NAVPU Price"]
                }
              />
              <Line
                type="monotone"
                dataKey={chartMode === "value" ? "fundValue" : "navpu"}
                stroke={chartMode === "value" ? PALETTE.green : PALETTE.blue}
                strokeWidth={3}
                dot={{ r: 4, fill: chartMode === "value" ? PALETTE.green : PALETTE.blue }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Bottom Split: Historical Price Table & All 22 Daily Prices ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: sm ? "1fr" : "1fr 1fr",
          gap: 16,
        }}
      >
        {/* Left: Selected Fund Historical NAVPU Log */}
        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 900, color: PALETTE.text }}>
            📜 Historical NAVPU Log — {selectedFundMeta.fundName}
          </h3>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${PALETTE.border}`, textAlign: "left", color: PALETTE.muted }}>
                  <th style={{ padding: "8px 6px" }}>Valuation Date</th>
                  <th style={{ padding: "8px 6px" }}>NAVPU</th>
                  <th style={{ padding: "8px 6px" }}>My Fund Value</th>
                  <th style={{ padding: "8px 6px" }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredSeries].reverse().map((row) => (
                  <tr key={row.date} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{row.date}</td>
                    <td style={{ padding: "8px 6px", color: PALETTE.blue, fontWeight: 800 }}>
                      {fmtMoney(row.navpu, selectedFundMeta.currency, 5)}
                    </td>
                    <td style={{ padding: "8px 6px", color: PALETTE.green, fontWeight: 800 }}>
                      {selectedHolding
                        ? fmtMoney(row.navpu * Number(selectedHolding.units || 0), selectedFundMeta.currency, 2)
                        : "—"}
                    </td>
                    <td style={{ padding: "8px 6px", fontSize: 11, color: PALETTE.muted }}>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: All 22 PRULink Funds Latest Daily Snapshot */}
        <div
          style={{
            backgroundColor: PALETTE.card,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 900, color: PALETTE.text }}>
            📋 All 22 Official PRULink Funds (Latest NAVPU)
          </h3>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${PALETTE.border}`, textAlign: "left", color: PALETTE.muted }}>
                  <th style={{ padding: "8px 6px" }}>PRULink Fund</th>
                  <th style={{ padding: "8px 6px" }}>Curr</th>
                  <th style={{ padding: "8px 6px" }}>Latest NAVPU</th>
                  <th style={{ padding: "8px 6px" }}>1D Chg</th>
                </tr>
              </thead>
              <tbody>
                {PRULINK_FUND_CATALOG.map((f) => {
                  const s = mergedPricesByFund[f.fundCode] || [];
                  const last = s[s.length - 1];
                  const prev = s[s.length - 2];
                  const chgPct =
                    last && prev && prev.navpu > 0
                      ? ((last.navpu - prev.navpu) / prev.navpu) * 100
                      : 0;
                  return (
                    <tr
                      key={f.fundCode}
                      onClick={() => setSelectedFundCode(f.fundCode)}
                      style={{
                        borderBottom: `1px solid ${PALETTE.border}`,
                        cursor: "pointer",
                        backgroundColor: f.fundCode === selectedFundCode ? PALETTE.cardElevated : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 6px", fontWeight: 700, color: PALETTE.text }}>{f.fundName}</td>
                      <td style={{ padding: "8px 6px", color: PALETTE.muted }}>{f.currency}</td>
                      <td style={{ padding: "8px 6px", fontWeight: 800, color: PALETTE.blue }}>
                        {last ? fmtMoney(last.navpu, f.currency, 5) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 6px",
                          fontWeight: 800,
                          color: chgPct >= 0 ? PALETTE.green : PALETTE.red,
                        }}
                      >
                        {chgPct >= 0 ? "+" : ""}
                        {chgPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Modal 1: Add / Edit Policy Fund Holding ── */}
      {holdingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            backgroundColor: "rgba(2, 8, 20, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              backgroundColor: PALETTE.card,
              border: `2px solid ${PALETTE.green}`,
              borderRadius: 14,
              padding: 22,
              color: PALETTE.text,
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: 19, fontWeight: 900 }}>
              {editingHoldingId ? "✏️ Edit Policy Fund Units" : "➕ Add My PRULink Policy Holding"}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, display: "block", marginBottom: 4 }}>
                  PRULink Fund
                </label>
                <select
                  value={holdingForm.fundCode}
                  onChange={(e) => setHoldingForm((p) => ({ ...p, fundCode: e.target.value }))}
                  style={{
                    width: "100%",
                    minHeight: 44,
                    backgroundColor: PALETTE.highContrast,
                    color: PALETTE.text,
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                  }}
                >
                  {PRULINK_FUND_CATALOG.map((f) => (
                    <option key={f.fundCode} value={f.fundCode}>
                      [{f.currency}] {f.fundName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, display: "block", marginBottom: 4 }}>
                  Policy Plan Type
                </label>
                <select
                  value={holdingForm.policyType}
                  onChange={(e) => setHoldingForm((p) => ({ ...p, policyType: e.target.value }))}
                  style={{
                    width: "100%",
                    minHeight: 44,
                    backgroundColor: PALETTE.highContrast,
                    color: PALETTE.text,
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                  }}
                >
                  {POLICY_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, display: "block", marginBottom: 4 }}>
                    Number of Units Held *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 12450.523"
                    value={holdingForm.units}
                    onChange={(e) => setHoldingForm((p) => ({ ...p, units: e.target.value }))}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      backgroundColor: PALETTE.highContrast,
                      color: PALETTE.text,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 14,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, display: "block", marginBottom: 4 }}>
                    Total Premiums Paid (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 180000"
                    value={holdingForm.totalPremiumsPaid}
                    onChange={(e) => setHoldingForm((p) => ({ ...p, totalPremiumsPaid: e.target.value }))}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      backgroundColor: PALETTE.highContrast,
                      color: PALETTE.text,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, display: "block", marginBottom: 4 }}>
                    Policy No. / Nickname (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PAA-***8921"
                    value={holdingForm.policyNo}
                    onChange={(e) => setHoldingForm((p) => ({ ...p, policyNo: e.target.value }))}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      backgroundColor: PALETTE.highContrast,
                      color: PALETTE.text,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 14,
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, display: "block", marginBottom: 4 }}>
                    Statement / As-Of Date
                  </label>
                  <input
                    type="date"
                    value={holdingForm.asOf}
                    onChange={(e) => setHoldingForm((p) => ({ ...p, asOf: e.target.value }))}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      backgroundColor: PALETTE.highContrast,
                      color: PALETTE.text,
                      border: `1px solid ${PALETTE.border}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setHoldingModalOpen(false)}
                  style={solidBtnStyle({ bg: PALETTE.highContrast, fg: PALETTE.soft, border: PALETTE.border })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveHolding}
                  style={solidBtnStyle({ bg: PALETTE.greenBg, fg: PALETTE.text, border: PALETTE.green })}
                >
                  ✓ Save Policy Holding
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Log Unit Event (Top-Up / Charge / Withdrawal) ── */}
      {unitEventModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            backgroundColor: "rgba(2, 8, 20, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: PALETTE.card,
              border: `2px solid ${PALETTE.amber}`,
              borderRadius: 14,
              padding: 22,
              color: PALETTE.text,
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 900 }}>
              📝 Log Policy Unit Change (Top-Up / Charge / Withdrawal)
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <select
                value={unitEventForm.holdingId}
                onChange={(e) => setUnitEventForm((p) => ({ ...p, holdingId: e.target.value }))}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                }}
              >
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.fundName} ({h.units} units)
                  </option>
                ))}
              </select>

              <select
                value={unitEventForm.type}
                onChange={(e) => setUnitEventForm((p) => ({ ...p, type: e.target.value }))}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                }}
              >
                <option value="TOP_UP">➕ Premium Allocation / Top-Up (+Units)</option>
                <option value="CHARGE">➖ Monthly Admin / COI Charge Deduction (-Units)</option>
                <option value="WITHDRAWAL">➖ Partial Withdrawal (-Units)</option>
              </select>

              <input
                type="number"
                step="0.0001"
                placeholder="Units added or deducted (e.g. 125.45)"
                value={unitEventForm.unitsDelta}
                onChange={(e) => setUnitEventForm((p) => ({ ...p, unitsDelta: e.target.value }))}
                style={{
                  minHeight: 44,
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setUnitEventModalOpen(false)}
                  style={solidBtnStyle({ bg: PALETTE.highContrast, fg: PALETTE.soft, border: PALETTE.border })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveUnitEvent}
                  style={solidBtnStyle({ bg: PALETTE.amberBg, fg: PALETTE.text, border: PALETTE.amber })}
                >
                  ✓ Apply Unit Change
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 3: Add / Bulk Import Historical NAVPU ── */}
      {backfillModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            backgroundColor: "rgba(2, 8, 20, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 580,
              backgroundColor: PALETTE.card,
              border: `2px solid ${PALETTE.blue}`,
              borderRadius: 14,
              padding: 22,
              color: PALETTE.text,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900 }}>
              📥 Add or Import Historical NAVPU — {selectedFundMeta.fundName}
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: PALETTE.muted }}>
              Backfill past NAVPU unit prices from your Pru Life Statement of Account (SOA) or monthly Fund Fact Sheets.
            </p>

            {/* Single Date Entry */}
            <div
              style={{
                backgroundColor: PALETTE.highContrast,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, marginBottom: 8 }}>
                Quick Single Date Entry
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  style={{
                    minHeight: 44,
                    backgroundColor: PALETTE.card,
                    color: PALETTE.text,
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                  }}
                />
                <input
                  type="number"
                  step="0.00001"
                  placeholder="NAVPU (e.g. 1.64538)"
                  value={manualNavpu}
                  onChange={(e) => setManualNavpu(e.target.value)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    backgroundColor: PALETTE.card,
                    color: PALETTE.text,
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddManualPrice}
                  style={solidBtnStyle({ bg: PALETTE.greenBg, fg: PALETTE.text, border: PALETTE.green })}
                >
                  + Add Price
                </button>
              </div>
            </div>

            {/* Bulk CSV Paste */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: PALETTE.soft, marginBottom: 6 }}>
                Bulk Paste (One "Date, NAVPU" per line — supports YYYY-MM-DD or DD-MMM-YY)
              </div>
              <textarea
                rows={5}
                placeholder={"2025-12-15, 1.5420\n2026-06-15, 1.6085\n11-Nov-26, 1.64538"}
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
                style={{
                  width: "100%",
                  backgroundColor: PALETTE.highContrast,
                  color: PALETTE.text,
                  border: `1px solid ${PALETTE.border}`,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  fontFamily: "monospace",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setBackfillModalOpen(false)}
                style={solidBtnStyle({ bg: PALETTE.highContrast, fg: PALETTE.soft, border: PALETTE.border })}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleBulkCsvImport}
                style={solidBtnStyle({ bg: PALETTE.blueBg, fg: PALETTE.text, border: PALETTE.blue })}
              >
                📥 Import All Rows
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

