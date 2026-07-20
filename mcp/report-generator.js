/**
 * Server-side HTML report generator.
 * Takes a raw user_data row from Supabase and produces the same dark-themed
 * HTML email report as the frontend ReportTab.
 */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const OT_RATES = { weekday: 750, weekend: 680 };
const TAX_RATE = 0.20;
const TYPE_CLR = { Investment: '#bc8cff', Savings: '#3fb950', Checking: '#388bfd', Digital: '#56d364' };

function makeKey(year, mi) { return `${year}-${String(mi + 1).padStart(2, '0')}`; }
function parseKey(k) { const [y, m] = k.split('-'); return { year: parseInt(y), monthIdx: parseInt(m) - 1 }; }
function displayKey(k) { if (!k) return ''; const { year, monthIdx } = parseKey(k); return `${MONTH_NAMES[monthIdx]} ${year}`; }
function shortKey(k) { if (!k) return ''; const { year, monthIdx } = parseKey(k); return `${MONTH_NAMES[monthIdx].slice(0, 3)} ${String(year).slice(2)}`; }
function peso(n) { return '₱' + Math.abs(Math.round(n)).toLocaleString(); }

function classifyExpense(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('rent') || n.includes('parent') || n.includes('pru') || n.includes('insurance')) return 'Fixed';
  if (n.includes('cc') || n.includes('gold') || n.includes('watch') || n.includes('atome') || n.includes('zed') || n.includes('iphone') || n.includes('loan')) return 'Debt';
  if (n.includes('mp2') || n.includes('investment') || n.includes('invest')) return 'Investment';
  return 'Variable';
}

function calcOT(ot) {
  const wdE = (ot.weekday || 0) * OT_RATES.weekday;
  const weE = (ot.weekend || 0) * OT_RATES.weekend;
  const gross = wdE + weE;
  const tax = gross * TAX_RATE;
  return { gross, tax, net: gross - tax };
}

function calcSummary(p) {
  const otCalc = calcOT(p.ot || {});
  const totalIncome = (p.salary || 27000) + otCalc.net;
  const totalExpenses = (p.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { otCalc, totalIncome, totalExpenses, netSavings: totalIncome - totalExpenses };
}

function calcMonth(md) {
  const s5 = calcSummary(md['5th'] || { salary: 27000, ot: {}, expenses: [] });
  const s20 = calcSummary(md['20th'] || { salary: 27000, ot: {}, expenses: [] });
  const income = s5.totalIncome + s20.totalIncome;
  const expenses = s5.totalExpenses + s20.totalExpenses;
  const savings = s5.netSavings + s20.netSavings;
  return {
    income, expenses, savings,
    otIncome: s5.otCalc.net + s20.otCalc.net,
    savingsRate: income > 0 ? (savings / income) * 100 : 0,
  };
}

/**
 * Generate the report month keys for a given range.
 */
function getReportKeys(reportRange) {
  const now = new Date();
  const CUR_YEAR = now.getFullYear();
  const CUR_MONTH = now.getMonth();
  const curKey = makeKey(CUR_YEAR, CUR_MONTH);

  if (reportRange === 'current') return [curKey];
  if (reportRange === '3m') {
    const res = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(CUR_YEAR, CUR_MONTH - i, 1);
      res.push(makeKey(d.getFullYear(), d.getMonth()));
    }
    return res;
  }
  if (reportRange === 'ytd') {
    const res = [];
    for (let m = 0; m <= CUR_MONTH; m++) res.push(makeKey(CUR_YEAR, m));
    return res;
  }
  if (reportRange === '12m') {
    const res = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(CUR_YEAR, CUR_MONTH - i, 1);
      res.push(makeKey(d.getFullYear(), d.getMonth()));
    }
    return res;
  }
  return [curKey];
}

/**
 * Generate the full HTML email report from raw Supabase data.
 *
 * @param {object} userData - The user_data row from Supabase
 * @param {string} reportRange - 'current' | '3m' | 'ytd' | '12m'
 * @returns {string} HTML email body
 */
export function generateReportHTML(userData, reportRange = 'current') {
  const budgetData = userData.budget_data || {};
  const accounts = userData.accounts || [];
  const majorExpenses = userData.major_expenses || [];
  const credits = userData.credits || [];
  const debts = userData.debts || [];

  const now = new Date();
  const CUR_YEAR = now.getFullYear();
  const CUR_MONTH = now.getMonth();
  const curKey = makeKey(CUR_YEAR, CUR_MONTH);

  const keys = getReportKeys(reportRange);

  // Compute stats per month
  const stats = keys.map(key => {
    const md = budgetData[key] || (key === curKey ? { '5th': { salary: 27000, ot: { weekday: 0, weekend: 0 }, expenses: [] }, '20th': { salary: 27000, ot: { weekday: 0, weekend: 0 }, expenses: [] } } : null);
    let fixed = 0, variable = 0, debt = 0, investment = 0;
    if (md) {
      ['5th', '20th'].forEach(p => {
        if (md[p]) {
          (md[p].expenses || []).forEach(e => {
            const cat = classifyExpense(e.name);
            const amt = Number(e.amount) || 0;
            if (cat === 'Fixed') fixed += amt;
            else if (cat === 'Variable') variable += amt;
            else if (cat === 'Debt') debt += amt;
            else if (cat === 'Investment') investment += amt;
          });
        }
      });
    }
    const mt = md ? calcMonth(md) : { income: 0, expenses: 0, savings: 0, otIncome: 0, savingsRate: 0 };
    return { key, label: shortKey(key), ...mt, fixed, variable, debt, investment };
  });

  const totalIncome = stats.reduce((s, m) => s + m.income, 0);
  const totalExpenses = stats.reduce((s, m) => s + m.expenses, 0);
  const totalSavings = stats.reduce((s, m) => s + m.savings, 0);
  const totalOT = stats.reduce((s, m) => s + m.otIncome, 0);
  const totalFixed = stats.reduce((s, m) => s + m.fixed, 0);
  const totalVariable = stats.reduce((s, m) => s + m.variable, 0);
  const totalDebtPayments = stats.reduce((s, m) => s + m.debt, 0);
  const totalInvestments = stats.reduce((s, m) => s + m.investment, 0);

  const active = stats.filter(s => s.income > 0);
  const avgRate = active.length ? active.reduce((s, m) => s + m.savingsRate, 0) / active.length : 0;

  // Net worth
  const totalBal = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalCredits = credits.filter(c => !c.done).reduce((s, c) => s + (c.amount || 0), 0);
  const totalDebts = debts.reduce((s, d) => s + (d.balance || 0), 0);
  const netWorth = totalBal + totalCredits - totalDebts;
  const liquid = accounts.filter(a => ['Savings', 'Checking', 'Digital'].includes(a.type)).reduce((s, a) => s + (a.balance || 0), 0);
  const avgExp = active.length ? active.reduce((s, m) => s + m.expenses, 0) / active.length : 0;
  const safetyMonths = avgExp > 0 ? liquid / avgExp : 0;

  // Health score
  const debtRatio = totalIncome > 0 ? (totalDebtPayments / totalIncome) * 100 : 0;
  let healthScore = 0;
  if (avgRate >= 30) healthScore += 30; else if (avgRate >= 20) healthScore += 20; else if (avgRate >= 10) healthScore += 10;
  if (safetyMonths >= 6) healthScore += 30; else if (safetyMonths >= 3) healthScore += 20; else if (safetyMonths >= 1) healthScore += 10;
  if (debtRatio <= 15) healthScore += 25; else if (debtRatio <= 30) healthScore += 15; else if (debtRatio <= 45) healthScore += 5;
  const overspentCount = majorExpenses.filter(e => (e.actual || 0) > (e.budget || 0)).length;
  if (overspentCount === 0) healthScore += 15; else if (overspentCount <= 2) healthScore += 5;

  const gradeLabel = healthScore >= 90 ? 'Excellent' : healthScore >= 70 ? 'Good' : healthScore >= 50 ? 'Warning' : 'Critical';
  const gradeColor = healthScore >= 90 ? '#24d17e' : healthScore >= 70 ? '#4b8dff' : healthScore >= 50 ? '#f2a71b' : '#ff514f';
  const gradeEmoji = healthScore >= 90 ? '🟢' : healthScore >= 70 ? '🔵' : healthScore >= 50 ? '🟡' : '🔴';

  // Budget vs actual
  const grouped = {};
  keys.forEach(key => {
    const md = budgetData[key];
    if (md) {
      ['5th', '20th'].forEach(p => {
        if (md[p]) {
          (md[p].expenses || []).forEach(e => {
            if (e.name) {
              if (!grouped[e.name]) grouped[e.name] = { name: e.name, budget: 0, actual: 0 };
              grouped[e.name].budget += e.budget ?? e.amount;
              grouped[e.name].actual += e.amount;
            }
          });
        }
      });
    }
  });
  const bvsA = Object.values(grouped).sort((a, b) => b.budget - a.budget);

  // Insights
  const insights = [];
  if (avgRate >= 30) insights.push({ text: `Savings rate is excellent at ${Math.round(avgRate)}%.`, type: 'good' });
  else if (avgRate < 10) insights.push({ text: `Savings rate is low at ${Math.round(avgRate)}%. Consider cutting variable expenses.`, type: 'warn' });
  else insights.push({ text: `Savings rate is healthy at ${Math.round(avgRate)}%.`, type: 'info' });
  if (safetyMonths >= 6) insights.push({ text: 'Emergency fund is fully funded (6+ months of runway).', type: 'good' });
  else if (safetyMonths < 3) insights.push({ text: `Emergency fund covers only ${safetyMonths.toFixed(1)} months. Aim for 3-6 months.`, type: 'warn' });
  if (debtRatio > 35) insights.push({ text: `Debt payments consuming ${debtRatio.toFixed(1)}% of income — high risk.`, type: 'warn' });
  else insights.push({ text: `Debt-to-income ratio is healthy at ${debtRatio.toFixed(1)}%.`, type: 'good' });
  if (totalSavings > 0) insights.push({ text: `Net savings for this period: ${peso(totalSavings)}.`, type: 'info' });

  const reportDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const rangeLabel = reportRange === 'current' ? displayKey(curKey) :
    `${displayKey(keys[0])} – ${displayKey(keys[keys.length - 1])}`;

  // Build HTML sections
  const insightRows = insights.map(i => {
    const color = i.type === 'warn' ? '#ff514f' : i.type === 'good' ? '#24d17e' : '#4b8dff';
    const icon = i.type === 'warn' ? '⚠️' : i.type === 'good' ? '✅' : 'ℹ️';
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #1c2b42;font-size:13px;"><span style="color:${color}">${icon}</span> ${i.text}</td></tr>`;
  }).join('');

  const budgetRows = bvsA.slice(0, 15).map(row => {
    const pct = row.budget > 0 ? (row.actual / row.budget) * 100 : 0;
    const isOver = row.actual > row.budget;
    const statusColor = isOver ? '#ff514f' : '#24d17e';
    const status = isOver ? '⚠️ Over' : '✅ OK';
    return `<tr style="border-bottom:1px solid #1c2b4222;">
      <td style="padding:8px 12px;font-weight:600;">${row.name}</td>
      <td style="padding:8px 12px;text-align:right;">₱${Math.round(row.budget).toLocaleString()}</td>
      <td style="padding:8px 12px;text-align:right;color:${statusColor};">₱${Math.round(row.actual).toLocaleString()}</td>
      <td style="padding:8px 12px;text-align:right;">${pct.toFixed(0)}%</td>
      <td style="padding:8px 12px;text-align:center;color:${statusColor};">${status}</td>
    </tr>`;
  }).join('');

  const accountRows = accounts.map(a => {
    const typeColor = TYPE_CLR[a.type] || '#8ea0b8';
    return `<tr style="border-bottom:1px solid #1c2b4222;">
      <td style="padding:8px 12px;font-weight:600;">${a.name}</td>
      <td style="padding:8px 12px;"><span style="color:${typeColor};font-weight:600;">${a.type}</span></td>
      <td style="padding:8px 12px;text-align:right;font-weight:700;">₱${(a.balance || 0).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const debtRows = debts.map(d => `<tr style="border-bottom:1px solid #1c2b4222;">
    <td style="padding:8px 12px;font-weight:600;">${d.name}</td>
    <td style="padding:8px 12px;text-align:right;color:#ff514f;font-weight:700;">₱${(d.balance || 0).toLocaleString()}</td>
    <td style="padding:8px 12px;text-align:right;">₱${(d.limit || 0).toLocaleString()}</td>
    <td style="padding:8px 12px;text-align:right;">${d.apr || 0}%</td>
  </tr>`).join('');

  const goalRows = majorExpenses.map(e => {
    const pct = (e.budget || 0) > 0 ? ((e.actual || 0) / e.budget) * 100 : 0;
    const barWidth = Math.min(pct, 100);
    const barColor = e.done ? '#24d17e' : '#4b8dff';
    return `<tr style="border-bottom:1px solid #1c2b4222;">
      <td style="padding:8px 12px;font-weight:600;">${e.name} ${e.done ? '✅' : ''}</td>
      <td style="padding:8px 12px;text-align:right;">₱${(e.actual || 0).toLocaleString()} / ₱${(e.budget || 0).toLocaleString()}</td>
      <td style="padding:8px 12px;text-align:right;">${pct.toFixed(0)}%</td>
      <td style="padding:8px 12px;width:100px;">
        <div style="background:#1c2b42;border-radius:4px;height:8px;overflow:hidden;">
          <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:4px;"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020814;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#eef5ff;">
<div style="max-width:680px;margin:0 auto;padding:24px;">
  <div style="text-align:center;padding:28px 0 16px;border-bottom:1px solid #1c2b42;margin-bottom:24px;">
    <div style="display:inline-block;width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#f2a71b,#ff7a45);text-align:center;line-height:38px;color:#08111f;font-weight:900;font-size:16px;margin-bottom:10px;">B</div>
    <h1 style="margin:10px 0 4px;font-size:22px;font-weight:800;color:#eef5ff;">Scheduled Financial Report</h1>
    <p style="margin:0;font-size:12px;color:#8ea0b8;">Auto-generated on ${reportDate}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#8ea0b8;">Period: ${rangeLabel}</p>
  </div>
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">📊 Executive Summary</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;text-align:center;width:33%;">
          <div style="font-size:10px;color:#8ea0b8;text-transform:uppercase;font-weight:800;margin-bottom:4px;">Health Score</div>
          <div style="font-size:24px;font-weight:800;color:${gradeColor};">${healthScore}/100</div>
          <div style="font-size:11px;color:${gradeColor};font-weight:700;">${gradeEmoji} ${gradeLabel}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;text-align:center;width:33%;">
          <div style="font-size:10px;color:#8ea0b8;text-transform:uppercase;font-weight:800;margin-bottom:4px;">Net Worth</div>
          <div style="font-size:24px;font-weight:800;color:#4b8dff;">₱${Math.round(netWorth).toLocaleString()}</div>
          <div style="font-size:11px;color:#8ea0b8;">${safetyMonths.toFixed(1)} months runway</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:12px;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;text-align:center;width:33%;">
          <div style="font-size:10px;color:#8ea0b8;text-transform:uppercase;font-weight:800;margin-bottom:4px;">Savings Rate</div>
          <div style="font-size:24px;font-weight:800;color:#24d17e;">${Math.round(avgRate)}%</div>
          <div style="font-size:11px;color:#8ea0b8;">${active.length} active month(s)</div>
        </td>
      </tr>
    </table>
  </div>
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">💰 Income & Expense Analysis</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;">
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">Total Income</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:#4b8dff;">₱${Math.round(totalIncome).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">Total Expenses</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:#ff514f;">₱${Math.round(totalExpenses).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">Net Savings</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:${totalSavings >= 0 ? '#24d17e' : '#ff514f'};">₱${Math.round(totalSavings).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">OT Income</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:#7257ff;">₱${Math.round(totalOT).toLocaleString()}</td></tr>
      <tr><td colspan="2" style="padding:10px 14px;border-top:2px solid #1c2b42;"></td></tr>
      <tr style="border-bottom:1px solid #1c2b4233;"><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Fixed</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalFixed).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b4233;"><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Variable</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalVariable).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b4233;"><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Debt Payments</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalDebtPayments).toLocaleString()}</td></tr>
      <tr><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Investments</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalInvestments).toLocaleString()}</td></tr>
    </table>
  </div>
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">📋 Budget Compliance</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;"><th style="padding:8px 12px;text-align:left;">Category</th><th style="padding:8px 12px;text-align:right;">Budget</th><th style="padding:8px 12px;text-align:right;">Actual</th><th style="padding:8px 12px;text-align:right;">Used</th><th style="padding:8px 12px;text-align:center;">Status</th></tr>
      ${budgetRows}
    </table>
  </div>
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">🏦 Asset Allocation</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;"><th style="padding:8px 12px;text-align:left;">Account</th><th style="padding:8px 12px;text-align:left;">Type</th><th style="padding:8px 12px;text-align:right;">Balance</th></tr>
      ${accountRows}
      <tr style="border-top:2px solid #1c2b42;"><td colspan="2" style="padding:10px 12px;font-weight:800;">Total Assets</td><td style="padding:10px 12px;text-align:right;font-weight:800;color:#24d17e;">₱${totalBal.toLocaleString()}</td></tr>
    </table>
  </div>
  ${debts.length > 0 ? `<div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">💳 Debt Status</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;"><th style="padding:8px 12px;text-align:left;">Debt</th><th style="padding:8px 12px;text-align:right;">Balance</th><th style="padding:8px 12px;text-align:right;">Limit</th><th style="padding:8px 12px;text-align:right;">APR</th></tr>
      ${debtRows}
      <tr style="border-top:2px solid #1c2b42;"><td style="padding:10px 12px;font-weight:800;">Total Owed</td><td style="padding:10px 12px;text-align:right;font-weight:800;color:#ff514f;">₱${totalDebts.toLocaleString()}</td><td colspan="2"></td></tr>
    </table>
  </div>` : ''}
  ${majorExpenses.length > 0 ? `<div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">🎯 Goals Progress</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;"><th style="padding:8px 12px;text-align:left;">Goal</th><th style="padding:8px 12px;text-align:right;">Progress</th><th style="padding:8px 12px;text-align:right;">%</th><th style="padding:8px 12px;">Bar</th></tr>
      ${goalRows}
    </table>
  </div>` : ''}
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">💡 Smart Insights</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;">
      ${insightRows}
    </table>
  </div>
  <div style="text-align:center;padding:20px 0;border-top:1px solid #1c2b42;color:#8ea0b8;font-size:11px;">
    <p style="margin:0;">This is a scheduled report from Budget App 2026.</p>
    <p style="margin:4px 0 0;">Period: ${rangeLabel} • ${reportDate}</p>
  </div>
</div>
</body>
</html>`;
}
