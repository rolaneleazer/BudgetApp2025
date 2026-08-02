/**
 * upgrade_dashboard.cjs
 * Adds to the main Dashboard:
 *  1. account-pulse   — live per-account balance cards with change indicator
 *  2. recent-tx       — last 6 transactions from debitHistory
 *  3. spending-velocity — daily bar chart of spending this month
 *  4. Updates insights-row to include Spending Breakdown donut
 *  5. Passes setTab to Dashboard so widgets can navigate
 */

const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC, 'utf8');

// ─── 1. Update DEFAULT_CARD_ORDER ──────────────────────────────────────────────
src = src.replace(
  `const DEFAULT_CARD_ORDER = ['metrics','balance-logs','cashflow','charts-row','budget-row','insights-row'];`,
  `const DEFAULT_CARD_ORDER = ['metrics','account-pulse','recent-tx','balance-logs','spending-velocity','cashflow','charts-row','budget-row','insights-row'];`
);
console.log('[OK] DEFAULT_CARD_ORDER updated');

// ─── 2. Update Dashboard signature to accept setTab ───────────────────────────
src = src.replace(
  `function Dashboard({ budgetData, accounts, majorExpenses, credits, debts = DEF_DEBTS, balanceHistory, sm }) {`,
  `function Dashboard({ budgetData, accounts, majorExpenses, credits, debts = DEF_DEBTS, balanceHistory, sm, setTab }) {`
);
console.log('[OK] Dashboard signature updated (added setTab)');

// ─── 3. Update router to pass setTab to Dashboard ─────────────────────────────
src = src.replace(
  `{tab==='dashboard'   &&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm}/>}`,
  `{tab==='dashboard'   &&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm} setTab={setTab}/>}`
);
console.log('[OK] Router updated (passing setTab to Dashboard)');

// ─── 4. Update SECTION_LABELS ─────────────────────────────────────────────────
src = src.replace(
  `  const SECTION_LABELS = {
    'metrics': 'Key Metrics',
    'balance-logs': 'Balance Logs',
    'cashflow': 'Cash Flow',
    'charts-row': 'Charts',
    'budget-row': 'Budget & Goals',
    'insights-row': 'Insights',
  };`,
  `  const SECTION_LABELS = {
    'metrics':            'Key Metrics',
    'account-pulse':      'Account Balances',
    'recent-tx':          'Recent Transactions',
    'balance-logs':       'Balance Logs',
    'spending-velocity':  'Spending Velocity',
    'cashflow':           'Cash Flow',
    'charts-row':         'Charts',
    'budget-row':         'Budget & Goals',
    'insights-row':       'Insights',
  };`
);
console.log('[OK] SECTION_LABELS updated');

// ─── 5. Insert new section cases before `default:` ────────────────────────────
const NEW_CASES = `
      case 'account-pulse': return (
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏦 Account Balances</div>
            {setTab && (
              <button onClick={() => setTab('accounts')}
                style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 5, color: C.muted, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                → Manage Accounts
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(auto-fill, minmax(175px, 1fr))', gap: 10 }}>
            {accounts.map(acc => {
              const lastLog = balanceHistory.length > 0
                ? [...balanceHistory].sort((a, b) => b.date.localeCompare(a.date))[0]
                : null;
              const prevBal = lastLog?.balances?.[acc.id];
              const diff     = prevBal !== undefined ? acc.balance - prevBal : null;
              const dclr     = diff === null ? C.muted : diff > 0 ? C.green : diff < 0 ? C.red : C.muted;
              const dicon    = diff === null ? '—' : diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
              const tclr     = TYPE_CLR[acc.type] || C.muted;
              return (
                <div key={acc.id} style={{ background: \`linear-gradient(135deg, \${C.card2}, \${C.card})\`, borderRadius: 8, border: \`1px solid \${C.border}\`, padding: '12px 14px', position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = tclr + '88'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: tclr, borderRadius: '8px 0 0 8px' }} />
                  <div style={{ fontSize: 9, color: tclr, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{acc.type}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted }}>{acc.name}</div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{confidentialValue(peso(acc.balance))}</div>
                  {diff !== null && (
                    <div style={{ fontSize: 10, color: dclr, marginTop: 5, fontWeight: 700 }}>
                      {dicon} {diff >= 0 ? '+' : ''}{peso(diff)} vs last log
                    </div>
                  )}
                  {diff === null && <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>No snapshot yet</div>}
                </div>
              );
            })}
          </div>
        </div>
      );

      case 'recent-tx': return (
        <Card style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SecTitle style={{ margin: 0 }}>💸 Recent Transactions</SecTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>{(budgetData.debitHistory || []).length} total</span>
              {setTab && (
                <button onClick={() => setTab('transactions')}
                  style={{ background: \`\${C.blue}18\`, border: \`1px solid \${C.blue}55\`, borderRadius: 5, color: C.blue, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                  → View All
                </button>
              )}
            </div>
          </div>

          {(!budgetData.debitHistory || budgetData.debitHistory.length === 0) ? (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '20px 0', lineHeight: 1.7 }}>
              📭 No transactions yet.{' '}
              {setTab && (
                <button onClick={() => setTab('transactions')}
                  style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
                  Log your first debit →
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[...(budgetData.debitHistory || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6).map(tx => (
                <div key={tx.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 7, background: \`\${C.panel}55\`, cursor: 'default', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = \`\${C.panel}cc\`}
                  onMouseLeave={e => e.currentTarget.style.background = \`\${C.panel}55\`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{tx.accountName} · {tx.date}</div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 14, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>−{peso(tx.amount)}</div>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: \`\${C.blue}22\`, color: C.blue, fontWeight: 700 }}>{tx.period || '—'}</span>
                  </div>
                </div>
              ))}
              {(budgetData.debitHistory || []).length > 6 && (
                <button onClick={() => setTab && setTab('transactions')}
                  style={{ marginTop: 6, background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 6, color: C.muted, padding: '6px', fontSize: 11, cursor: 'pointer', width: '100%' }}>
                  + {(budgetData.debitHistory || []).length - 6} more transactions →
                </button>
              )}
            </div>
          )}
        </Card>
      );

      case 'spending-velocity': return (
        <Card style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SecTitle style={{ margin: 0 }}>📊 Spending Velocity — {MONTH_NAMES[CUR_MONTH]}</SecTitle>
            {setTab && (
              <button onClick={() => setTab('transactions')}
                style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 5, color: C.muted, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                → Transactions
              </button>
            )}
          </div>
          {(() => {
            const thisMonthKey = \`\${CUR_YEAR}-\${String(CUR_MONTH + 1).padStart(2, '0')}\`;
            const txThisMonth  = (budgetData.debitHistory || []).filter(t => (t.date || '').startsWith(thisMonthKey));
            if (txThisMonth.length === 0) {
              return (
                <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '28px 0', lineHeight: 1.7 }}>
                  No cash debits logged for {MONTH_NAMES[CUR_MONTH]} yet.<br/>
                  <span style={{ fontSize: 11 }}>Use the Transactions tab to log debits and see your daily spending pace.</span>
                </div>
              );
            }
            const daysInMonth = new Date(CUR_YEAR, CUR_MONTH + 1, 0).getDate();
            const today       = NOW.getDate();
            const dailyData   = [];
            for (let d = 1; d <= Math.min(today, daysInMonth); d++) {
              const dateStr  = \`\${thisMonthKey}-\${String(d).padStart(2, '0')}\`;
              const dayTotal = txThisMonth.filter(t => t.date === dateStr).reduce((s, t) => s + (t.amount || 0), 0);
              dailyData.push({ day: d, amount: Math.round(dayTotal / 100) / 10 });
            }
            const totalSpent = txThisMonth.reduce((s, t) => s + (t.amount || 0), 0);
            const avgPerDay  = today > 0 ? totalSpent / today : 0;
            const projected  = avgPerDay * daysInMonth;
            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Total Spent',   value: peso(totalSpent), color: C.red   },
                    { label: 'Avg / Day',     value: peso(avgPerDay),  color: C.amber },
                    { label: 'Est. Month-End',value: peso(projected),  color: C.purple},
                  ].map(m => (
                    <div key={m.label} style={{ background: \`\${m.color}11\`, borderRadius: 7, padding: '10px 12px', border: \`1px solid \${m.color}33\` }}>
                      <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={sm ? 120 : 145}>
                  <BarChart data={dailyData} margin={{ top: 5, right: 5, left: sm ? -28 : -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={\`\${C.border}55\`} />
                    <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: C.muted, fontSize: 9 }} tickFormatter={v => \`\${v}k\`} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={ttip} formatter={v => [\`₱\${v}k\`, 'Spent']} labelFormatter={d => \`Day \${d}\`} />
                    <Bar dataKey="amount" fill={C.red} radius={[3, 3, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </Card>
      );

`;

const DEFAULT_CASE = `      default: return null;`;
if (!src.includes(DEFAULT_CASE)) {
  console.error('[ERROR] Could not find default case to insert before');
  process.exit(1);
}
src = src.replace(DEFAULT_CASE, NEW_CASES + DEFAULT_CASE);
console.log('[OK] New dashboard sections inserted (account-pulse, recent-tx, spending-velocity)');

// ─── 6. Update insights-row to add Spending Breakdown donut ──────────────────
const OLD_INSIGHTS = `      case 'insights-row': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 12 }}>
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
        </div>
      );`;

const NEW_INSIGHTS = `      case 'insights-row': return (
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
                { name: 'Fixed',    value: fixed,       color: C.red    },
                { name: 'Variable', value: variable,    color: C.orange },
                { name: 'Debt',     value: debt,        color: C.amber  },
                { name: 'Invest',   value: investment,  color: C.purple },
                { name: 'Manual',   value: manualDebits,color: C.blue   },
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
      );`;

if (!src.includes(OLD_INSIGHTS)) {
  console.error('[ERROR] insights-row pattern not found — please check for changes');
} else {
  src = src.replace(OLD_INSIGHTS, NEW_INSIGHTS);
  console.log('[OK] insights-row updated (Spending Breakdown donut added)');
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(SRC, src, 'utf8');
console.log('\n✅ Dashboard upgrade complete!');
console.log('   → account-pulse: Live per-account balance cards with change vs last log');
console.log('   → recent-tx:     Last 6 transactions with "View All" navigation');
console.log('   → spending-velocity: Daily bar chart with total/avg/projected');
console.log('   → insights-row:  Now 3-column with Spending Breakdown donut');
console.log('   → setTab: passed through to enable cross-tab navigation');
