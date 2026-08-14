/**
 * fix_insights_row.cjs
 * Replaces the insights-row case to 3-column layout with spending breakdown donut.
 * Also fixes SECTION_LABELS to include all new sections.
 */
const fs   = require('fs');
const path = require('path');
const SRC  = path.join(__dirname, '..', 'src', 'App.jsx');
let src    = fs.readFileSync(SRC, 'utf8');

// ── 1. Find insights-row case boundaries ──────────────────────────────────────
const START_MARKER = "case 'insights-row': return (";
const END_MARKER   = "\n      case 'account-pulse':";   // next case we added

const startIdx = src.indexOf(START_MARKER);
const endIdx   = src.indexOf(END_MARKER);

if (startIdx === -1) { console.error('[ERROR] insights-row start not found'); process.exit(1); }
if (endIdx   === -1) { console.error('[ERROR] account-pulse boundary not found'); process.exit(1); }

// The section we want to replace ends just before \n      case 'account-pulse':
// We need the full block (including the trailing ;\n\n)
const OLD_BLOCK = src.slice(startIdx, endIdx);

const NEW_BLOCK = `case 'insights-row': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Smart Insights</SecTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, padding: '6px 8px', borderRadius: 6, background: ins.type === 'warn' ? \`\${C.red}11\` : ins.type === 'good' ? \`\${C.green}11\` : \`\${C.blue}11\` }}>
                  <span style={{ color: ins.type === 'warn' ? C.red : ins.type === 'good' ? C.green : C.blue }}>
                    {ins.type === 'warn' ? '● Warning:' : ins.type === 'good' ? '● Safe:' : '● Note:'}
                  </span>
                  <span style={{ color: C.text }}>{ins.text}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Net Worth Breakdown</SecTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ResponsiveContainer width={110} height={110}>
                <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>{pieData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip contentStyle={ttip} formatter={v => peso(v)} /></PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {[...new Set(accounts.map(a => a.type))].map(type => {
                  const color = TYPE_CLR[type] || C.muted;
                  const t = accounts.filter(a => a.type === type).reduce((s, a) => s + a.balance, 0);
                  if (!t) return null;
                  return (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                      <span style={{ color, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: 'inline-block' }} />
                        {type}
                      </span>
                      <span style={{ color: C.muted }}>{fmtK(t)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>This Month Spending</SecTitle>
            {(() => {
              const thisMonthKey = \`\${CUR_YEAR}-\${String(CUR_MONTH + 1).padStart(2, '0')}\`;
              const md = budgetData[thisMonthKey];
              let fixed = 0, variable = 0, debt = 0, investment = 0;
              if (md) {
                ['5th', '20th'].forEach(p => {
                  (md[p]?.expenses || []).forEach(e => {
                    const cat = classifyExpense(e.name);
                    const amt = Number(e.amount) || 0;
                    if (cat === 'Fixed') fixed += amt;
                    else if (cat === 'Variable') variable += amt;
                    else if (cat === 'Debt') debt += amt;
                    else if (cat === 'Investment') investment += amt;
                  });
                });
              }
              const manualDebits = (budgetData.debitHistory || [])
                .filter(t => (t.date || '').startsWith(thisMonthKey))
                .reduce((s, t) => s + (t.amount || 0), 0);
              const spendData = [
                { name: 'Fixed',    value: fixed,        color: C.red    },
                { name: 'Variable', value: variable,     color: C.orange },
                { name: 'Debt',     value: debt,         color: C.amber  },
                { name: 'Invest',   value: investment,   color: C.purple },
                { name: 'Manual',   value: manualDebits, color: C.blue   },
              ].filter(d => d.value > 0);
              const totalSpend = spendData.reduce((s, d) => s + d.value, 0);
              if (spendData.length === 0) {
                return <div style={{ color: C.muted, fontSize: 11, textAlign: 'center', padding: '24px 0' }}>No spending data for {MONTH_NAMES[CUR_MONTH]} yet.</div>;
              }
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ResponsiveContainer width={110} height={110}>
                    <PieChart>
                      <Pie data={spendData} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={50}>
                        {spendData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={ttip} formatter={v => peso(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {spendData.map(d => (
                      <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                        <span style={{ color: d.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                          {d.name}
                        </span>
                        <span style={{ color: C.muted }}>{fmtK(d.value)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: \`1px solid \${C.border}55\`, fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.muted, fontWeight: 700 }}>TOTAL</span>
                      <span style={{ fontWeight: 800, color: C.red }}>{peso(totalSpend)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
      );
`;

src = src.slice(0, startIdx) + NEW_BLOCK + src.slice(endIdx);
console.log('[OK] insights-row replaced with 3-column layout + Spending Breakdown donut');

// ── 2. Fix SECTION_LABELS if it wasn't updated ───────────────────────────────
const OLD_LABELS = `  const SECTION_LABELS = {
    'metrics': 'Key Metrics',
    'balance-logs': 'Balance Logs',
    'cashflow': 'Cash Flow',
    'charts-row': 'Charts',
    'budget-row': 'Budget & Goals',
    'insights-row': 'Insights',
  };`;

const NEW_LABELS = `  const SECTION_LABELS = {
    'metrics':           'Key Metrics',
    'account-pulse':     'Account Balances',
    'recent-tx':         'Recent Transactions',
    'balance-logs':      'Balance Logs',
    'spending-velocity': 'Spending Velocity',
    'cashflow':          'Cash Flow',
    'charts-row':        'Charts',
    'budget-row':        'Budget & Goals',
    'insights-row':      'Insights',
  };`;

if (src.includes(OLD_LABELS)) {
  src = src.replace(OLD_LABELS, NEW_LABELS);
  console.log('[OK] SECTION_LABELS updated with new sections');
} else {
  console.log('[INFO] SECTION_LABELS was already updated, skipping');
}

fs.writeFileSync(SRC, src, 'utf8');
console.log('\n✅ insights-row and SECTION_LABELS fixed successfully!');
