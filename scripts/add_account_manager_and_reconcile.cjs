// ─── TASK.MD UPDATE ───────────────────────────────────────────────────────────
// Phase 11: Account Manager Tab + Reconcile & Audit Tab
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 1. REPLACE AccountsTab – clean read-only view with "Manage Accounts" link
// ─────────────────────────────────────────────────────────────────────────────
const OLD_ACCOUNTS_TAB = `// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
function AccountsTab({ accounts, setAccounts, sm, readOnly, canWrite, canUpdate }) {
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
}`;

const NEW_ACCOUNTS_TAB = `// ─── ACCOUNTS (Clean Read-Only View) ─────────────────────────────────────────
function AccountsTab({ accounts, setAccounts, sm, readOnly, canWrite, canUpdate, setTab }) {
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const grouped = accounts.reduce((g, a) => { (g[a.type] = g[a.type] || []).push(a); return g; }, {});

  const typeColors = { Investment: C.purple, Savings: C.green, Checking: C.blue, Digital: C.teal, Cash: C.amber };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>🏦 My Accounts</div>
          <div style={{ fontSize: 12, color: C.muted }}>Overview of all account balances grouped by category.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canUpdate && (
            <button onClick={() => setTab('account-manager')}
              style={{ padding: '8px 16px', borderRadius: 8, border: \`1px solid \${C.amber}55\`, background: \`\${C.amber}18\`, color: C.amber, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              🗂️ Manage Accounts →
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Banner ── */}
      <div style={{ background: \`linear-gradient(135deg, \${C.purple}22, \${C.green}18)\`, borderRadius: 14, border: \`1px solid \${C.border}\`, padding: '18px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>Total Net Worth</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: C.green }}>₱{total.toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {Object.entries(grouped).map(([type, accs]) => (
            <div key={type} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: typeColors[type] || C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{type}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{peso(accs.reduce((s, a) => s + a.balance, 0))}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{accs.length} account{accs.length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Category Card Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {Object.entries(grouped).map(([type, accs]) => {
          const catTotal = accs.reduce((s, a) => s + a.balance, 0);
          const color = typeColors[type] || C.muted;
          return (
            <Card key={type} style={{ marginBottom: 0, border: \`1px solid \${color}33\` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 32, borderRadius: 4, background: color }} />
                  <div>
                    <SecTitle style={{ margin: 0, fontSize: 13 }}>{type}</SecTitle>
                    <div style={{ fontSize: 10, color: C.muted }}>{accs.length} account{accs.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color }}>{peso(catTotal)}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{total > 0 ? Math.round(catTotal / total * 100) : 0}% of total</div>
                </div>
              </div>

              {/* Balance Bar */}
              <div style={{ height: 4, borderRadius: 2, background: \`\${C.border}44\`, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: \`\${total > 0 ? (catTotal / total * 100) : 0}%\`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>

              {accs.map(acc => (
                <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: \`1px solid \${C.border}22\` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{acc.name}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: acc.balance >= 0 ? C.text : C.red }}>{peso(acc.balance)}</div>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── ACCOUNT MANAGER (Edit / Add / Delete Module) ─────────────────────────────
function AccountManagerTab({ accounts, setAccounts, sm, readOnly, canWrite, canUpdate }) {
  const [editing, setEditing]     = useState(null);
  const [editData, setEditData]   = useState({});
  const [showAdd, setShowAdd]     = useState(false);
  const [newAcc, setNewAcc]       = useState({ name: '', type: 'Savings', balance: 0 });
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch]       = useState('');

  const total   = accounts.reduce((s, a) => s + a.balance, 0);
  const highest = accounts.reduce((a, b) => (b.balance > (a?.balance ?? -Infinity) ? b : a), null);
  const lowest  = accounts.reduce((a, b) => (b.balance < (a?.balance ?? Infinity) ? b : a), null);
  const cats    = [...new Set(accounts.map(a => a.type))];

  const filtered = accounts
    .filter(a => filterType === 'all' || a.type === filterType)
    .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));

  function startEdit(acc) { setEditData({ ...acc }); setEditing(acc.id); }
  function saveEdit() {
    setAccounts(p => p.map(a => a.id === editing ? { ...a, ...editData, balance: Number(editData.balance) || 0 } : a));
    setEditing(null);
  }
  function deleteAcc(id) {
    if (window.confirm('Delete this account? This cannot be undone.')) {
      setAccounts(p => p.filter(a => a.id !== id));
    }
  }
  function addAccount() {
    if (!newAcc.name.trim()) return;
    setAccounts(p => [...p, { id: 'acc-' + Date.now(), name: newAcc.name.trim(), type: newAcc.type, balance: Number(newAcc.balance) || 0 }]);
    setNewAcc({ name: '', type: 'Savings', balance: 0 });
    setShowAdd(false);
  }

  const typeColors = { Investment: C.purple, Savings: C.green, Checking: C.blue, Digital: C.teal, Cash: C.amber };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>🗂️ Account Manager</div>
        <div style={{ fontSize: 12, color: C.muted }}>Add, edit, and manage all your financial accounts in one place.</div>
      </div>

      {/* ── 4 Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        <MetricCard icon="💰" label="Total Net Worth"  value={peso(total)}                       color={C.green}  sm={sm} />
        <MetricCard icon="🏦" label="Total Accounts"   value={accounts.length.toString()}        color={C.blue}   sm={sm} sub={\`\${cats.length} categories\`} />
        <MetricCard icon="📈" label="Highest Balance"  value={highest ? peso(highest.balance) : '—'} color={C.purple} sm={sm} sub={highest?.name || '—'} />
        <MetricCard icon="📉" label="Lowest Balance"   value={lowest ? peso(lowest.balance) : '—'}  color={C.red}    sm={sm} sub={lowest?.name || '—'} />
      </div>

      {/* ── Add New Account Panel ── */}
      {canWrite && (
        <Card style={{ marginBottom: 16, border: \`1px solid \${C.amber}33\` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAdd ? 14 : 0 }}>
            <SecTitle style={{ margin: 0 }}>➕ Add New Account</SecTitle>
            <button onClick={() => setShowAdd(p => !p)}
              style={{ background: showAdd ? \`\${C.amber}22\` : 'none', border: \`1px solid \${C.amber}55\`, borderRadius: 6, color: C.amber, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {showAdd ? 'Cancel' : '+ Add Account'}
            </button>
          </div>
          {showAdd && (
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '2fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Account Name</label>
                <Inp value={newAcc.name} onChange={e => setNewAcc(p => ({ ...p, name: e.target.value }))} placeholder="e.g. BDO Savings, GCash…" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Account Type</label>
                <select value={newAcc.type} onChange={e => setNewAcc(p => ({ ...p, type: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 7, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', width: '100%' }}>
                  {['Investment','Savings','Checking','Digital','Cash'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Starting Balance</label>
                <Inp type="number" value={newAcc.balance} onChange={e => setNewAcc(p => ({ ...p, balance: e.target.value }))} style={{ textAlign: 'right' }} placeholder="₱0" />
              </div>
              <BtnG onClick={addAccount} style={{ padding: '8px 18px', whiteSpace: 'nowrap' }}>💾 Save</BtnG>
            </div>
          )}
        </Card>
      )}

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Inp value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search accounts…" style={{ flex: 1, minWidth: 180, padding: '7px 10px', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...cats].map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: \`1px solid \${filterType === t ? (typeColors[t] || C.blue) : C.border}\`, background: filterType === t ? \`\${typeColors[t] || C.blue}22\` : 'transparent', color: filterType === t ? (typeColors[t] || C.blue) : C.muted }}>
              {t === 'all' ? '🔀 All' : t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Account Table ── */}
      <Card style={{ marginBottom: 0, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: \`\${C.card2}\`, borderBottom: \`1px solid \${C.border}\` }}>
                <th style={{ textAlign: 'left',  padding: '12px 16px', color: C.muted, fontWeight: 700, fontSize: 11 }}>ACCOUNT NAME</th>
                <th style={{ textAlign: 'left',  padding: '12px 16px', color: C.muted, fontWeight: 700, fontSize: 11 }}>TYPE</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: C.muted, fontWeight: 700, fontSize: 11 }}>BALANCE</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', color: C.muted, fontWeight: 700, fontSize: 11 }}>% OF TOTAL</th>
                {canUpdate && <th style={{ textAlign: 'center', padding: '12px 16px', color: C.muted, fontWeight: 700, fontSize: 11 }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: C.muted, fontSize: 12 }}>No accounts found.</td></tr>
              )}
              {filtered.map(acc => {
                const color = typeColors[acc.type] || C.muted;
                const pct   = total > 0 ? (acc.balance / total * 100) : 0;
                return (
                  <tr key={acc.id} style={{ borderBottom: \`1px solid \${C.border}22\`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = \`\${C.card2}88\`}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      {editing === acc.id ? (
                        <Inp value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} style={{ width: '100%', padding: '5px 8px' }} />
                      ) : (
                        <div style={{ fontWeight: 600, color: C.text }}>{acc.name}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {editing === acc.id ? (
                        <select value={editData.type} onChange={e => setEditData(p => ({ ...p, type: e.target.value }))}
                          style={{ padding: '5px 8px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 12 }}>
                          {['Investment','Savings','Checking','Digital','Cash'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: \`\${color}22\`, color }}>{acc.type}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {editing === acc.id ? (
                        <Inp type="number" value={editData.balance} onChange={e => setEditData(p => ({ ...p, balance: e.target.value }))} style={{ width: 130, textAlign: 'right', padding: '5px 8px' }} />
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 14, color: acc.balance >= 0 ? C.green : C.red }}>{peso(acc.balance)}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: \`\${C.border}44\`, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: \`\${pct}%\`, background: color, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, color: C.muted, minWidth: 32 }}>{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    {canUpdate && (
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {editing === acc.id ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <BtnG onClick={saveEdit} style={{ padding: '4px 12px', fontSize: 11 }}>✓ Save</BtnG>
                            <Btn onClick={() => setEditing(null)} style={{ padding: '4px 10px', fontSize: 11 }}>Cancel</Btn>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={() => startEdit(acc)}
                              style={{ background: \`\${C.blue}18\`, border: \`1px solid \${C.blue}44\`, borderRadius: 5, color: C.blue, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Edit</button>
                            <button onClick={() => deleteAcc(acc.id)}
                              style={{ background: \`\${C.red}18\`, border: \`1px solid \${C.red}44\`, borderRadius: 5, color: C.red, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑 Delete</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Add ReconcileTab before "MAJOR EXPENSES" marker
// ─────────────────────────────────────────────────────────────────────────────
const RECONCILE_TAB = `
// ─── RECONCILE & AUDIT TAB ───────────────────────────────────────────────────
function ReconcileTab({ accounts, setAccounts, balanceHistory, setBalanceHistory, sm, canWrite, canUpdate }) {
  const [logDate,     setLogDate]     = useState(new Date().toISOString().slice(0, 10));
  const [logBalances, setLogBalances] = useState({});
  const [updateCurr,  setUpdateCurr]  = useState(true);
  const [successMsg,  setSuccessMsg]  = useState('');
  const [filterSearch, setFilterSearch] = useState('');

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
    setSuccessMsg('Audit snapshot saved!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // Metrics
  const sorted     = [...balanceHistory].sort((a, b) => b.date.localeCompare(a.date));
  const lastLog    = sorted[0];
  const prevLog    = sorted[1];
  const auditedNet = lastLog ? Object.values(lastLog.balances).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const prevNet    = prevLog ? Object.values(prevLog.balances).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const liveTotal  = accounts.reduce((s, a) => s + a.balance, 0);
  const variance   = liveTotal - auditedNet;
  const diff       = auditedNet - prevNet;

  // Chart data
  const chartData = [...balanceHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(h => ({ date: h.date.slice(5), total: Math.round(Object.values(h.balances).reduce((s, v) => s + (Number(v) || 0), 0) / 1000) }));

  const filteredHistory = sorted.filter(h => !filterSearch || h.date.includes(filterSearch));

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>🔍 Reconcile & Audit</div>
        <div style={{ fontSize: 12, color: C.muted }}>Verify account balances against physical bank statements and track your net worth over time.</div>
      </div>

      {/* ── 4 Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        <MetricCard icon="📅" label="Last Audit Date"      value={lastLog?.date || '—'}                                        color={C.blue}                        sm={sm} />
        <MetricCard icon="💰" label="Audited Net Assets"   value={auditedNet ? peso(auditedNet) : '₱0'}                        color={C.green}                       sm={sm} sub={diff !== 0 ? (diff > 0 ? '+' : '') + peso(diff) + ' vs prev' : 'First snapshot'} />
        <MetricCard icon="📊" label="Live Ledger Total"    value={peso(liveTotal)}                                              color={C.purple}                      sm={sm} sub={\`\${accounts.length} accounts\`} />
        <MetricCard icon="⚖️"  label="Reconciliation Variance" value={(variance > 0 ? '+' : '') + peso(variance)}              color={Math.abs(variance) < 100 ? C.green : C.red} sm={sm} sub={Math.abs(variance) < 100 ? 'Balanced ✓' : 'Review needed'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* ── Left: Snapshot Form + History ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Snapshot Form */}
          <Card style={{ marginBottom: 0, border: \`1px solid \${C.green}33\` }}>
            <SecTitle>📷 Record Audit Snapshot</SecTitle>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
              Enter the actual balances from your physical bank statements for this date. This creates a verifiable audit point.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Snapshot Date</label>
              <Inp type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {accounts.map(acc => (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>Current: {peso(acc.balance)}</div>
                  </div>
                  <Inp type="number" value={logBalances[acc.id] ?? ''} onChange={e => handleBalChange(acc.id, e.target.value)}
                    style={{ width: 130, textAlign: 'right', padding: '6px 8px' }} placeholder="₱0" />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" id="chk-upd-rec" checked={updateCurr} onChange={e => setUpdateCurr(e.target.checked)} style={{ accentColor: C.green, cursor: 'pointer' }} />
              <label htmlFor="chk-upd-rec" style={{ fontSize: 11, color: C.muted, cursor: 'pointer', userSelect: 'none' }}>Also update current live account balances</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {canWrite && <BtnG onClick={handleSave} style={{ padding: '8px 20px', fontSize: 12 }}>💾 Save Audit Snapshot</BtnG>}
              {successMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {successMsg}</span>}
            </div>
          </Card>

          {/* Snapshot History Table */}
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <SecTitle style={{ margin: 0 }}>📋 Audit History</SecTitle>
              <Inp value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Filter by date…" style={{ width: 140, padding: '5px 8px', fontSize: 11 }} />
            </div>
            {filteredHistory.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No audit snapshots yet. Record your first snapshot above.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: \`1px solid \${C.border}\`, color: C.muted }}>
                      <th style={{ textAlign: 'left', padding: '8px 8px' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '8px 8px' }}>Net Worth</th>
                      <th style={{ textAlign: 'right', padding: '8px 8px' }}>Change</th>
                      <th style={{ textAlign: 'center', padding: '8px 8px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.slice(0, 15).map((log, i) => {
                      const tot  = Object.values(log.balances).reduce((s, v) => s + (Number(v) || 0), 0);
                      const prev = filteredHistory[i + 1];
                      const prevTot = prev ? Object.values(prev.balances).reduce((s, v) => s + (Number(v) || 0), 0) : null;
                      const chg   = prevTot !== null ? tot - prevTot : null;
                      return (
                        <tr key={log.date} style={{ borderBottom: \`1px solid \${C.border}18\` }}>
                          <td style={{ padding: '9px 8px', fontWeight: 600 }}>{log.date}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: C.green }}>{peso(tot)}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', fontSize: 11 }}>
                            {chg !== null ? (
                              <span style={{ color: chg >= 0 ? C.green : C.red, fontWeight: 600 }}>{chg >= 0 ? '+' : ''}{peso(chg)}</span>
                            ) : <span style={{ color: C.muted }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                            <button onClick={() => { setLogDate(log.date); setLogBalances({ ...log.balances }); }}
                              style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 4, color: C.muted, padding: '2px 7px', cursor: 'pointer', fontSize: 10, marginRight: 4 }}>Load</button>
                            {canUpdate && (
                              <button onClick={() => { if (confirm(\`Delete audit snapshot for \${log.date}?\`)) setBalanceHistory(p => p.filter(h => h.date !== log.date)); }}
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

        {/* ── Right: Area Chart ── */}
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>📈 Net Worth Over Time (₱k)</SecTitle>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Historical net worth trend based on all recorded audit snapshots.
          </div>
          {chartData.length < 2 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '80px 0', lineHeight: 1.7 }}>
              📊 Log at least 2 snapshots<br/>to see your net worth trend chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.green} stopOpacity={0.45}/>
                    <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={\`\${C.border}44\`} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttip} formatter={v => [\`₱\${(v * 1000).toLocaleString()}\`, 'Net Worth']} />
                <Area type="monotone" dataKey="total" stroke={C.green} strokeWidth={2.5} fill="url(#recGrad)" dot={{ fill: C.green, r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

`;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Apply the AccountsTab replacement
// ─────────────────────────────────────────────────────────────────────────────
if (src.includes(OLD_ACCOUNTS_TAB)) {
  src = src.replace(OLD_ACCOUNTS_TAB, NEW_ACCOUNTS_TAB);
  console.log('[OK] Replaced AccountsTab with clean read-only view + AccountManagerTab');
} else {
  // Try partial match on the marker and function signature
  const marker = '// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────\nfunction AccountsTab';
  const endMarker = '// ─── TRANSACTIONS TAB ────────────────────────────────────────────────────────';
  const si = src.indexOf('// ─── ACCOUNTS ──────────────────────────────────────────────────────────────');
  const ei = src.indexOf(endMarker, si);
  if (si !== -1 && ei !== -1) {
    src = src.slice(0, si) + NEW_ACCOUNTS_TAB + '\n\n' + src.slice(ei);
    console.log('[OK] Replaced AccountsTab via marker range');
  } else {
    console.error('[WARN] Could not find AccountsTab, inserting AccountManagerTab before TRANSACTIONS TAB marker');
    src = src.replace(
      '// ─── TRANSACTIONS TAB ────────────────────────────────────────────────────────',
      NEW_ACCOUNTS_TAB + '\n\n// ─── TRANSACTIONS TAB ────────────────────────────────────────────────────────'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Insert ReconcileTab before MAJOR EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
const MAJOR_MARKER = '// ─── MAJOR EXPENSES ───────────────────────────────────────────────────────────';
if (src.includes(MAJOR_MARKER)) {
  src = src.replace(MAJOR_MARKER, RECONCILE_TAB + MAJOR_MARKER);
  console.log('[OK] Inserted ReconcileTab before Major Expenses');
} else {
  console.error('[ERROR] Could not find Major Expenses marker for ReconcileTab insertion');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Update NAV_TABS – insert account-manager and reconcile entries
// ─────────────────────────────────────────────────────────────────────────────
src = src.replace(
  `{id:'accounts',    label:'Accounts',           icon:'🏦',group:'manage'},`,
  `{id:'accounts',       label:'Accounts',              icon:'🏦',group:'manage'},
    {id:'account-manager', label:'Account Manager',       icon:'🗂️',group:'manage'},
    {id:'reconcile',       label:'Reconcile & Audit',     icon:'🔍',group:'manage'},`
);
console.log('[OK] Updated NAV_TABS with account-manager and reconcile');

// ─────────────────────────────────────────────────────────────────────────────
// 6. Update TLBL labels map
// ─────────────────────────────────────────────────────────────────────────────
src = src.replace(
  `accounts:'Accounts',`,
  `accounts:'Accounts',\n    'account-manager':'Account Manager',\n    reconcile:'Reconcile & Audit',`
);
console.log('[OK] Updated TLBL labels');

// ─────────────────────────────────────────────────────────────────────────────
// 7. Update Tab Router – add account-manager and reconcile routes
// ─────────────────────────────────────────────────────────────────────────────
src = src.replace(
  `{tab==='accounts'    &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}`,
  `{tab==='accounts'       &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate} setTab={setTab}/>}
              {tab==='account-manager'&&<AccountManagerTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='reconcile'      &&<ReconcileTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm} canWrite={canWrite} canUpdate={canUpdate}/>}`
);
console.log('[OK] Updated tab router with account-manager and reconcile routes');

// ─────────────────────────────────────────────────────────────────────────────
// Write output
// ─────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done!');
