/**
 * apply_all_splits.cjs
 * Performs clean replacement of AccountsTab, TransactionsTab, BalanceLogTab, NAV_TABS, TLBL, TABS, and router.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC, 'utf8');

// ── 1. NEW ACCOUNTS TAB (clean cards only) ───────────────────────────────────
const NEW_ACCOUNTS_TAB = `function AccountsTab({ accounts, setAccounts, sm, readOnly, canWrite, canUpdate }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(null);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const grouped = accounts.reduce((g, a) => { (g[a.type] = g[a.type] || []).push(a); return g; }, {});

  function startEdit(acc) {
    setEditData({ ...acc });
    setEditing(acc.id);
  }
  function saveEdit() {
    setAccounts(p => p.map(a => a.id === editing ? editData : a));
    setEditing(null); setEditData(null);
  }
  function addNew(type = 'Investment') {
    const id = 'acc-' + Date.now();
    const newItem = { id, name: 'New Account', balance: 0, type };
    setAccounts(p => [...p, newItem]);
    startEdit(newItem);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ background: \`linear-gradient(135deg, \${C.card2}, \${C.card})\`, borderRadius: 12, border: \`1px solid \${C.border}\`, padding: '14px 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Total Net Worth</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.green }}>₱{total.toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canWrite && <BtnG onClick={() => addNew('New Category')}>+ New Category</BtnG>}
        </div>
        <datalist id="acc-types">
          {['Investment', 'Savings', 'Checking', 'Digital', ...new Set(accounts.map(a => a.type))].map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {Object.entries(grouped).map(([type, accs]) => (
          <Card key={type} style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_CLR[type] || C.muted, display: 'inline-block' }} />
                <SecTitle style={{ margin: 0 }}>{type}</SecTitle>
                {canWrite && (
                  <button title="Add account to this category" onClick={() => addNew(type)}
                    style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: '50%', color: C.muted, cursor: 'pointer', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>+</button>
                )}
              </div>
              <span style={{ color: TYPE_CLR[type] || C.muted, fontWeight: 700, fontSize: 14 }}>{peso(accs.reduce((s, a) => s + a.balance, 0))}</span>
            </div>
            {accs.map(acc => (
              <div key={acc.id} style={{ padding: '8px 0', borderTop: \`1px solid \${C.border}22\` }}>
                {editing === acc.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Inp value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} placeholder="Account Name" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Inp list="acc-types" value={editData.type} onChange={e => setEditData({ ...editData, type: e.target.value })} placeholder="Category" />
                      <Inp type="number" value={editData.balance} onChange={e => setEditData({ ...editData, balance: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <BtnG style={{ flex: 1 }} onClick={saveEdit}>Save Changes</BtnG>
                      <Btn onClick={() => { setEditing(null); setEditData(null); }}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{acc.name}</div>
                      <Tag color={TYPE_CLR[acc.type] || C.muted}>{acc.type}</Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{peso(acc.balance)}</span>
                      {canUpdate && <Btn style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => startEdit(acc)}>Edit</Btn>}
                      {canUpdate && (
                        <button onClick={() => setAccounts(p => p.filter(a => a.id !== acc.id))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── TRANSACTIONS TAB ────────────────────────────────────────────────────────
function TransactionsTab({ accounts, setAccounts, budgetData, setBudgetData, sm, readOnly, canWrite, canUpdate }) {
  const [selectedAccId, setSelectedAccId] = useState(accounts[0]?.id || '');
  const [debitAmount, setDebitAmount] = useState('');
  const [debitDesc, setDebitDesc] = useState('');
  const [debitDate, setDebitDate] = useState(new Date().toISOString().slice(0, 10));
  const [debitPeriod, setDebitPeriod] = useState(new Date().getDate() <= 15 ? '5th' : '20th');
  const [debitSuccessMsg, setDebitSuccessMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filterSource, setFilterSource] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterAccount, setFilterAccount] = useState('all');

  const handleDebitDateChange = (val) => {
    setDebitDate(val);
    const day = Number(val.split('-')[2]) || 1;
    setDebitPeriod(day <= 15 ? '5th' : '20th');
  };

  const manualDebits   = (budgetData.debitHistory       || []).map(d => ({ ...d, source: 'manual',      sourceLabel: 'Manual Debit' }));
  const ccCharges      = (budgetData.ccHistory          || []).map(d => ({ ...d, source: 'cc',          sourceLabel: 'CC Charge'    }));
  const installments   = (budgetData.installmentHistory || []).map(d => ({ ...d, source: 'installment', sourceLabel: 'Installment'  }));
  const allTx = [...manualDebits, ...ccCharges, ...installments]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const now = new Date();
  const thisMonthKey = \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`;
  const last7Date    = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  const thisMonthAmt = allTx.filter(t => (t.date || '').slice(0, 7) === thisMonthKey).reduce((s, t) => s + (t.amount || 0), 0);
  const last7Amt     = allTx.filter(t => (t.date || '') >= last7Date).reduce((s, t) => s + (t.amount || 0), 0);
  const biggestTx    = allTx.reduce((mx, t) => (t.amount || 0) > (mx?.amount || 0) ? t : mx, null);

  const filtered = allTx.filter(t => {
    if (filterSource !== 'all' && t.source !== filterSource) return false;
    if (filterSearch && !\`\${t.description || ''}\${t.accountName || ''}\`.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterDateFrom && (t.date || '') < filterDateFrom) return false;
    if (filterDateTo   && (t.date || '') > filterDateTo)   return false;
    if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
    return true;
  });

  const handleDebit = () => {
    const accId = selectedAccId || accounts[0]?.id;
    if (!accId) return alert('Please select an account');
    if (!debitAmount || Number(debitAmount) <= 0) return alert('Please enter a valid amount');
    if (!debitDesc.trim()) return alert('Please enter a description');
    const account = accounts.find(a => a.id === accId);
    if (!account) return;
    const amount  = Number(debitAmount);
    const dateStr = debitDate;
    const period  = debitPeriod;
    const key     = dateStr.slice(0, 7);
    setAccounts(prev => prev.map(a => a.id === accId ? { ...a, balance: a.balance - amount } : a));
    setBudgetData(prev => {
      const monthData  = prev[key]         || makeMonthData();
      const periodData = monthData[period]  || makePeriod();
      const newExpense = { name: \`\${debitDesc.trim()} (\${account.name})\`, budget: amount, amount, done: true };
      const newItem    = {
        id: 'deb-' + Date.now(), accountId: accId, accountName: account.name,
        amount, description: debitDesc.trim(), date: dateStr, period,
        timestamp: new Date().toISOString()
      };
      return {
        ...prev,
        [key]: { ...monthData, [period]: { ...periodData, expenses: [...periodData.expenses, newExpense] } },
        debitHistory: [newItem, ...(prev.debitHistory || [])]
      };
    });
    setDebitAmount(''); setDebitDesc('');
    setDebitSuccessMsg('Debit logged!');
    setTimeout(() => setDebitSuccessMsg(''), 3000);
  };

  const handleDeleteTx = (tx) => {
    if (tx.source !== 'manual') return alert('Only manual debits can be refunded here.');
    if (!confirm(\`Refund ₱\${(tx.amount || 0).toLocaleString()} back to \${tx.accountName} and remove this entry?\`)) return;
    setAccounts(prev => prev.map(a => a.id === tx.accountId ? { ...a, balance: a.balance + tx.amount } : a));
    const key = (tx.date || '').slice(0, 7);
    const expName = \`\${tx.description} (\${tx.accountName})\`;
    setBudgetData(prev => {
      const md = prev[key] || makeMonthData();
      const pd = md[tx.period] || makePeriod();
      return {
        ...prev,
        [key]: { ...md, [tx.period]: { ...pd, expenses: pd.expenses.filter(e => !(e.name === expName && e.amount === tx.amount)) } },
        debitHistory: (prev.debitHistory || []).filter(h => h.id !== tx.id)
      };
    });
  };

  const SRC_CLR  = { manual: C.blue, cc: C.purple, installment: C.amber };
  const SRC_PILL = { manual: '💸', cc: '💳', installment: '📦' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <MetricCard icon="💸" label="This Month Total"     value={peso(thisMonthAmt)}                              color={C.red}    sm={sm} />
        <MetricCard icon="📅" label="Last 7 Days"          value={peso(last7Amt)}                                  color={C.amber}  sm={sm} />
        <MetricCard icon="🔢" label="Total Entries"         value={String(allTx.length)}                            color={C.blue}   sm={sm} />
        <MetricCard icon="🏆" label="Largest Transaction"   value={biggestTx ? peso(biggestTx.amount) : '₱0'}      sub={biggestTx?.description || '—'} color={C.purple} sm={sm} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? 16 : 0 }}>
          <SecTitle style={{ margin: 0 }}>⚡ Log New Debit</SecTitle>
          {canWrite && (
            <button onClick={() => setShowForm(p => !p)}
              style={{ padding: '5px 14px', borderRadius: 6, border: \`1px solid \${showForm ? C.red : C.green}\`, background: showForm ? \`\${C.red}18\` : \`\${C.green}18\`, color: showForm ? C.red : C.green, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {showForm ? '✕ Close' : '+ New Debit'}
            </button>
          )}
        </div>

        {showForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>From Account</label>
                <select value={selectedAccId} onChange={e => setSelectedAccId(e.target.value)} disabled={readOnly}
                  style={{ padding: '8px 12px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="" disabled>Select Account</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({peso(acc.balance)})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Description</label>
                <Inp type="text" value={debitDesc} onChange={e => setDebitDesc(e.target.value)} placeholder="e.g. Grocery, Medicine, Utilities" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Amount (₱)</label>
                <Inp type="number" value={debitAmount} onChange={e => setDebitAmount(e.target.value)} placeholder="0" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Date</label>
                <Inp type="date" value={debitDate} onChange={e => handleDebitDateChange(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Payroll Period</label>
                <select value={debitPeriod} onChange={e => setDebitPeriod(e.target.value)} disabled={readOnly}
                  style={{ padding: '8px 12px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="5th">5th Payroll (1st–15th)</option>
                  <option value="20th">20th Payroll (16th–31st)</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {canWrite && (
                <button onClick={handleDebit}
                  style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: \`linear-gradient(135deg, \${C.blue}, \${C.purple})\`, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 14px rgba(75,141,255,0.3)' }}>
                  ⚡ Deduct & Log
                </button>
              )}
              {debitSuccessMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {debitSuccessMsg}</span>}
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>Source:</span>
          {[['all','🔀 All'],['manual','💸 Manual'],['cc','💳 CC Charge'],['installment','📦 Installment']].map(([v,l]) => (
            <button key={v} onClick={() => setFilterSource(v)}
              style={{ padding: '5px 12px', borderRadius: 20, border: \`1px solid \${filterSource===v ? C.blue : C.border}\`, background: filterSource===v ? \`\${C.blue}22\` : 'transparent', color: filterSource===v ? C.blue : C.muted, cursor: 'pointer', fontSize: 12, fontWeight: filterSource===v ? 700 : 400, transition: 'all 0.15s' }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: '1 1 200px' }}>
            <Inp type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="🔍 Search description or account…" style={{ padding: '7px 10px', fontSize: 12 }} />
          </div>
          <Inp type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ width: 'auto', padding: '7px 8px', fontSize: 12 }} />
          <span style={{ fontSize: 11, color: C.muted }}>→</span>
          <Inp type="date" value={filterDateTo}   onChange={e => setFilterDateTo(e.target.value)}   style={{ width: 'auto', padding: '7px 8px', fontSize: 12 }} />
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 12, outline: 'none' }}>
            <option value="all">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {(filterSearch || filterDateFrom || filterDateTo || filterAccount !== 'all') && (
            <button onClick={() => { setFilterSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterAccount('all'); }}
              style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 6, color: C.muted, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SecTitle style={{ margin: 0 }}>Transaction Ledger</SecTitle>
          <span style={{ fontSize: 11, color: C.muted }}>
            {filtered.length} / {allTx.length} entries
            {filtered.length > 0 && <span style={{ marginLeft: 8, color: C.red, fontWeight: 700 }}>−{peso(filtered.reduce((s,t) => s+(t.amount||0),0))}</span>}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
            {allTx.length === 0 ? '📭 No transactions yet. Click "+ New Debit" to log your first one.' : '🔍 No results match your filters.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: \`1px solid \${C.border}\` }}>
                  <th style={{ textAlign: 'left',   padding: '8px 8px' }}>Date</th>
                  <th style={{ textAlign: 'left',   padding: '8px 8px' }}>Description</th>
                  <th style={{ textAlign: 'left',   padding: '8px 8px' }}>Account</th>
                  <th style={{ textAlign: 'left',   padding: '8px 8px' }}>Type</th>
                  <th style={{ textAlign: 'center', padding: '8px 8px' }}>Period</th>
                  <th style={{ textAlign: 'right',  padding: '8px 8px' }}>Amount</th>
                  <th style={{ textAlign: 'center', padding: '8px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => (
                  <tr key={tx.id}
                    style={{ borderBottom: \`1px solid \${C.border}18\`, transition: 'background 0.12s', cursor: 'default' }}
                    onMouseEnter={e => e.currentTarget.style.background = \`\${C.panel}88\`}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '9px 8px', color: C.muted, whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ padding: '9px 8px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</td>
                    <td style={{ padding: '9px 8px', color: C.muted }}>{tx.accountName}</td>
                    <td style={{ padding: '9px 8px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: \`\${SRC_CLR[tx.source]||C.muted}22\`, color: SRC_CLR[tx.source]||C.muted }}>
                        {SRC_PILL[tx.source]} {tx.sourceLabel}
                      </span>
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', fontSize: 11, color: C.muted }}>{tx.period || '—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: C.red }}>−{peso(tx.amount)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                      {canUpdate && tx.source === 'manual' && (
                        <button onClick={() => handleDeleteTx(tx)} title="Refund & Delete"
                          style={{ background: 'none', border: \`1px solid \${C.red}44\`, borderRadius: 5, color: C.red, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>↩</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── BALANCE LOG TAB ─────────────────────────────────────────────────────────
function BalanceLogTab({ accounts, setAccounts, balanceHistory, setBalanceHistory, sm, canWrite, canUpdate }) {
  const [logDate,      setLogDate]      = useState(new Date().toISOString().slice(0, 10));
  const [logBalances,  setLogBalances]  = useState({});
  const [updateCurr,   setUpdateCurr]   = useState(true);
  const [successMsg,   setSuccessMsg]   = useState('');

  useEffect(() => {
    const existing = balanceHistory.find(h => h.date === logDate);
    if (existing) {
      setLogBalances(existing.balances);
    } else {
      const curr = {};
      accounts.forEach(a => { curr[a.id] = a.balance; });
      setLogBalances(curr);
    }
  }, [logDate, balanceHistory, accounts]);

  const handleBalChange = (id, val) => setLogBalances(prev => ({ ...prev, [id]: val === '' ? '' : Number(val) }));

  const handleSave = () => {
    const newBals = { ...logBalances };
    accounts.forEach(a => { newBals[a.id] = (newBals[a.id] === undefined || newBals[a.id] === '') ? 0 : Number(newBals[a.id]); });
    setBalanceHistory(prev => {
      const idx = prev.findIndex(h => h.date === logDate);
      if (idx >= 0) { const u = [...prev]; u[idx] = { date: logDate, balances: newBals }; return u; }
      return [...prev, { date: logDate, balances: newBals }];
    });
    if (updateCurr) setAccounts(prev => prev.map(a => ({ ...a, balance: newBals[a.id] ?? a.balance })));
    setSuccessMsg('Snapshot saved!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const chartData = [...balanceHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(h => ({ date: h.date.slice(5), total: Math.round(Object.values(h.balances).reduce((s, v) => s + (Number(v) || 0), 0) / 1000) }));

  const sorted   = [...balanceHistory].sort((a, b) => b.date.localeCompare(a.date));
  const lastLog  = sorted[0];
  const prevLog  = sorted[1];
  const lastTot  = lastLog ? Object.values(lastLog.balances).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const prevTot  = prevLog ? Object.values(prevLog.balances).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const diff     = lastTot - prevTot;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        <MetricCard icon="📅" label="Last Snapshot Date"      value={lastLog?.date || '—'}                               color={C.blue}  sm={sm} />
        <MetricCard icon="💰" label="Net Worth at Last Log"   value={lastTot ? peso(lastTot) : '₱0'}                     color={C.green} sm={sm} />
        <MetricCard icon={diff >= 0 ? '📈' : '📉'} label="Change vs Previous" value={(diff >= 0 ? '+' : '') + peso(diff)} color={diff >= 0 ? C.green : C.red} sm={sm} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>📷 Record Balance Snapshot</SecTitle>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Log actual account balances at a point in time to track your net worth over time.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Snapshot Date</label>
              <Inp type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
              {accounts.map(acc => (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</span>
                  <Inp type="number" value={logBalances[acc.id] ?? ''} onChange={e => handleBalChange(acc.id, e.target.value)}
                    style={{ width: 120, textAlign: 'right', padding: '6px 8px' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" id="chk-upd" checked={updateCurr} onChange={e => setUpdateCurr(e.target.checked)}
                style={{ accentColor: C.green, cursor: 'pointer' }} />
              <label htmlFor="chk-upd" style={{ fontSize: 11, color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
                Also update current account balances
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {canWrite && <BtnG onClick={handleSave} style={{ padding: '7px 18px', fontSize: 12 }}>💾 Save Snapshot</BtnG>}
              {successMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {successMsg}</span>}
            </div>
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Recent Snapshots</SecTitle>
            {balanceHistory.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '12px 0' }}>No snapshots recorded yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: \`1px solid \${C.border}\`, color: C.muted }}>
                      <th style={{ textAlign: 'left',  padding: '6px 6px' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '6px 6px' }}>Net Worth</th>
                      <th style={{ textAlign: 'center',padding: '6px 6px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...balanceHistory].sort((a,b) => b.date.localeCompare(a.date)).slice(0,10).map(log => {
                      const tot = Object.values(log.balances).reduce((s,v) => s+(Number(v)||0), 0);
                      return (
                        <tr key={log.date} style={{ borderBottom: \`1px solid \${C.border}18\` }}>
                          <td style={{ padding: '8px 6px' }}>{log.date}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: C.green }}>{peso(tot)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <button onClick={() => { setLogDate(log.date); setLogBalances({...log.balances}); }}
                              style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 4, color: C.muted, padding: '2px 7px', cursor: 'pointer', fontSize: 10, marginRight: 4 }}>Load</button>
                            {canUpdate && (
                              <button onClick={() => { if(confirm(\`Delete snapshot for \${log.date}?\`)) setBalanceHistory(p => p.filter(h => h.date !== log.date)); }}
                                style={{ background: 'none', border: \`1px solid \${C.red}44\`, borderRadius: 4, color: C.red, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>Del</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card style={{ marginBottom: 0 }}>
          <SecTitle>📈 Net Worth Over Time (₱k)</SecTitle>
          {chartData.length < 2 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '60px 0', lineHeight: 1.7 }}>
              Log at least 2 snapshots<br/>to see your net worth chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.green} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={\`\${C.border}55\`} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttip} formatter={v => [\`₱\${(v*1000).toLocaleString()}\`,'Net Worth']} />
                <Area type="monotone" dataKey="total" stroke={C.green} strokeWidth={2.5} fill="url(#balGrad)" dot={{ fill: C.green, r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
`;

// ── 2. INSERT COMPONENTS IF NOT PRESENT ──────────────────────────────────────
if (!src.includes('function TransactionsTab')) {
  const targetMarker = 'function HistoryTab';
  if (src.includes(targetMarker)) {
    src = src.replace(targetMarker, NEW_ACCOUNTS_TAB + '\n\n' + NEW_TRANSACTIONS_TAB + '\n\n' + NEW_BALANCE_LOG_TAB + '\n\n' + targetMarker);
    console.log('[OK] Inserted AccountsTab, TransactionsTab, BalanceLogTab before HistoryTab');
  }
}

// ── 3. UPDATE TABS, TLBL, NAV_TABS ───────────────────────────────────────────
const oldTABSBlock = `  const TABS=[
    {id:'dashboard',label:sm?'📊':'📊 Dashboard'},
    {id:'history',  label:sm?'📋':'📋 History'},
    {id:'budget',   label:sm?'📅':'📅 Monthly'},
    {id:'accounts', label:sm?'🏦':'🏦 Accounts'},
    {id:'investments', label:sm?'📈':'📈 Investments'},
    {id:'debts',    label:sm?'💳':'💳 Debt Manager'},
    {id:'credits',  label:sm?'🤝':'🤝 Credits'},
    {id:'expenses', label:sm?'🎯':'🎯 Major'},
    {id:'calendar', label:sm?'📅':'📅 Calendar'},
    {id:'reports',  label:sm?'📊':'📊 Reports'},
    ...(isAdmin ? [{id:'admin', label:sm?'⚙️':'⚙️ Admin Panel'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');`;

const newTABSBlock = `  const TABS=[
    {id:'dashboard',   label:sm?'📊':'📊 Dashboard'},
    {id:'accounts',    label:sm?'🏦':'🏦 Accounts'},
    {id:'transactions',label:sm?'💸':'💸 Transactions'},
    {id:'balancelog',  label:sm?'📓':'📓 Balance Log'},
    {id:'budget',      label:sm?'📅':'📅 Monthly'},
    {id:'history',     label:sm?'📋':'📋 History'},
    {id:'investments', label:sm?'📈':'📈 Investments'},
    {id:'debts',       label:sm?'💳':'💳 Debts'},
    {id:'credits',     label:sm?'🤝':'🤝 Credits'},
    {id:'expenses',    label:sm?'🎯':'🎯 Goals'},
    {id:'calendar',    label:sm?'🗓':'🗓 Bills'},
    {id:'reports',     label:sm?'📊':'📊 Reports'},
    ...(isAdmin ? [{id:'admin', label:sm?'⚙️':'⚙️ Admin Panel'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');`;

if (src.includes(oldTABSBlock)) {
  src = src.replace(oldTABSBlock, newTABSBlock);
  console.log('[OK] TABS updated');
}

const oldTLBLBlock = `  const TLBL={
    dashboard:'Dashboard',
    history:'History',
    budget:'Monthly Budget',
    accounts:'Accounts',
    investments:'Investments',
    debts:'Debt Manager',
    credits:'Credits (Money Owed)',
    expenses:'Major Expenses',
    calendar:'Financial Calendar',
    reports:'Financial Reports',
    admin:'Admin Panel'
  };`;

const newTLBLBlock = `  const TLBL={
    dashboard:'Dashboard',
    history:'Budget History',
    budget:'Monthly Budget',
    accounts:'Accounts',
    transactions:'Transactions',
    balancelog:'Balance Log',
    investments:'Investments',
    debts:'Debt Manager',
    credits:'Credits (Money Owed)',
    expenses:'Major Expenses',
    calendar:'Financial Calendar',
    reports:'Financial Reports',
    admin:'Admin Panel'
  };`;

if (src.includes(oldTLBLBlock)) {
  src = src.replace(oldTLBLBlock, newTLBLBlock);
  console.log('[OK] TLBL updated');
}

const oldNAVBlock = `  const NAV_TABS=[
    {id:'dashboard',label:'Dashboard',icon:'D',group:'main'},
    {id:'accounts', label:'Accounts',icon:'A',group:'manage'},
    {id:'history',  label:'Transactions',icon:'T',group:'manage'},
    {id:'debts',    label:'Debts',icon:'L',group:'manage'},
    {id:'credits',  label:'Credits (Owed to You)',icon:'C',group:'manage'},
    {id:'expenses', label:'Goals',icon:'G',group:'manage'},
    {id:'budget',   label:'Budget',icon:'B',group:'manage'},
    {id:'calendar', label:'Bills',icon:'P',group:'manage'},
    {id:'investments', label:'Investments',icon:'I',group:'analytics'},
    {id:'reports', label:'Reports',icon:'R',group:'analytics'},
    ...(isAdmin ? [{id:'admin', label:'Admin Panel',icon:'S',group:'admin'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');`;

const newNAVBlock = `  const NAV_TABS=[
    {id:'dashboard',   label:'Dashboard',          icon:'D', group:'main'},
    {id:'accounts',    label:'Accounts',           icon:'A', group:'manage'},
    {id:'transactions',label:'Transactions',       icon:'💸',group:'manage'},
    {id:'balancelog',  label:'Balance Log',        icon:'📓',group:'manage'},
    {id:'debts',       label:'Debts',              icon:'L', group:'manage'},
    {id:'credits',     label:'Credits (Owed to You)',icon:'C',group:'manage'},
    {id:'expenses',    label:'Goals',              icon:'G', group:'manage'},
    {id:'budget',      label:'Monthly Budget',     icon:'B', group:'manage'},
    {id:'history',     label:'Budget History',     icon:'T', group:'manage'},
    {id:'calendar',    label:'Bills',              icon:'P', group:'manage'},
    {id:'investments', label:'Investments',        icon:'I', group:'analytics'},
    {id:'reports',     label:'Reports',            icon:'R', group:'analytics'},
    ...(isAdmin ? [{id:'admin', label:'Admin Panel',icon:'S',group:'admin'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');`;

if (src.includes(oldNAVBlock)) {
  src = src.replace(oldNAVBlock, newNAVBlock);
  console.log('[OK] NAV_TABS updated');
}

// ── 4. UPDATE ROUTER ─────────────────────────────────────────────────────────
const oldRouterPattern = `{tab==='accounts' &&<AccountsTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}`;
const newRouterPattern = `{tab==='accounts'    &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='transactions'&&<TransactionsTab accounts={accounts} setAccounts={setAccounts} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='balancelog'  &&<BalanceLogTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm} canWrite={canWrite} canUpdate={canUpdate}/>}`;

if (src.includes(oldRouterPattern)) {
  src = src.replace(oldRouterPattern, newRouterPattern);
  console.log('[OK] Router updated with transactions and balancelog routes');
}

fs.writeFileSync(SRC, src, 'utf8');
console.log('✅ apply_all_splits.cjs completed successfully!');
