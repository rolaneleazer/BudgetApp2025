const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — REMOVE BALANCE LOG FROM NAV_TABS (keep the component and data safe)
// ─────────────────────────────────────────────────────────────────────────────
src = src.replace(
  `{id:'balancelog',  label:'Balance Log',        icon:'📓',group:'manage'},`,
  `// Balance Log removed - superseded by Reconcile & Audit tab (data preserved)`
);
console.log('[OK] Removed Balance Log from NAV_TABS');

// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — UPGRADE MajorTab → Active / History Split with metric cards
// ─────────────────────────────────────────────────────────────────────────────
const OLD_MAJOR_TAB = `function MajorTab({majorExpenses,setMajorExpenses,sm,readOnly,canWrite,canUpdate}) {
  const tot=majorExpenses.reduce((s,e)=>s+e.budget,0);
  const spent=majorExpenses.reduce((s,e)=>s+e.actual,0);
  function upd(id,f,v){
    if (readOnly) return;
    setMajorExpenses(p=>p.map(e=>e.id===id?{...e,[f]:['budget','actual'].includes(f)?(Number(v)||0):v}:e));
  }
  return(
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:sm?8:12,marginBottom:14}}>
        <MetricCard label="Budget" value={fmtK(tot)} color={C.amber} sm={sm}/>
        <MetricCard label="Spent" value={fmtK(spent)} color={C.red} sm={sm}/>
        <MetricCard label="Left" value={fmtK(tot-spent)} color={tot-spent>=0?C.green:C.red} sm={sm}/>
      </div>
      <Card>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <SecTitle>Major Expenses</SecTitle>
          {canWrite && (
            <BtnG style={{padding:'6px 12px',fontSize:12}} onClick={()=>setMajorExpenses(p=>[...p,{id:Date.now(),name:'New Expense',budget:0,actual:0,done:false}])}>+ Add</BtnG>
          )}
        </div>
        {majorExpenses.map(e=>{
          const pct=e.budget>0?Math.min(100,Math.round(e.actual/e.budget*100)):0;
          return(
            <div key={e.id} style={{marginBottom:16,paddingBottom:16,borderBottom:\`1px solid \${C.border}22\`}}>
              <div style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                <Inp value={e.name} onChange={ev=>upd(e.id,'name',ev.target.value)} style={{flex:1,opacity:e.done?0.5:1}} disabled={readOnly}/>
                {canUpdate && <button onClick={()=>upd(e.id,'done',!e.done)} style={{minWidth:60,background:'none',border:\`1px solid \${e.done?C.green:C.border}\`,borderRadius:6,padding:'8px 6px',cursor:'pointer',color:e.done?C.green:C.muted,fontSize:11,whiteSpace:'nowrap'}}>{e.done?'✓ Done':'Pending'}</button>}
                {canUpdate && <button onClick={()=>setMajorExpenses(p=>p.filter(x=>x.id!==e.id))} style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:18}}>×</button>}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Budget</div><Inp type="number" value={e.budget||''} onChange={ev=>upd(e.id,'budget',ev.target.value)} placeholder="0" style={{textAlign:'right'}} disabled={readOnly}/></div>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Actual Spent</div><Inp type="number" value={e.actual||''} onChange={ev=>upd(e.id,'actual',ev.target.value)} placeholder="0" style={{textAlign:'right'}} disabled={readOnly}/></div>
              </div>
              <div style={{background:C.border,borderRadius:4,height:5}}><div style={{width:\`\${pct}%\`,height:'100%',background:e.done?C.green:pct>90?C.red:C.amber,borderRadius:4}}/></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginTop:3}}><span>{peso(e.actual)} spent</span><span>{pct}% of {peso(e.budget)}</span></div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}`;

const NEW_MAJOR_TAB = `function MajorTab({majorExpenses,setMajorExpenses,sm,readOnly,canWrite,canUpdate}) {
  const [activeView, setActiveView] = useState('active'); // 'active' | 'history'
  const [histYear,   setHistYear]   = useState('all');

  const active  = majorExpenses.filter(e => !e.done);
  const history = majorExpenses.filter(e => e.done);
  const histFiltered = histYear === 'all' ? history : history.filter(e => (e.doneDate || '').startsWith(histYear));

  const totBudget = active.reduce((s, e) => s + (e.budget || 0), 0);
  const totSpent  = active.reduce((s, e) => s + (e.actual || 0), 0);
  const onTrack   = active.filter(e => e.budget > 0 && e.actual <= e.budget).length;
  const onTrackPct = active.length > 0 ? Math.round(onTrack / active.length * 100) : 100;

  const histYears = [...new Set(history.map(e => (e.doneDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();

  function upd(id, f, v) {
    if (readOnly) return;
    setMajorExpenses(p => p.map(e => e.id === id ? { ...e, [f]: ['budget','actual'].includes(f) ? (Number(v) || 0) : v } : e));
  }

  function markDone(id) {
    setMajorExpenses(p => p.map(e => e.id === id ? { ...e, done: true, doneDate: new Date().toISOString().slice(0, 10) } : e));
  }

  function reopen(id) {
    setMajorExpenses(p => p.map(e => e.id === id ? { ...e, done: false, doneDate: null } : e));
  }

  function addGoal() {
    setMajorExpenses(p => [...p, { id: Date.now(), name: 'New Goal', budget: 0, actual: 0, done: false, doneDate: null }]);
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>🎯 Goals & Major Expenses</div>
          <div style={{ fontSize: 12, color: C.muted }}>Track saving goals and major expense milestones.</div>
        </div>
        {canWrite && activeView === 'active' && (
          <BtnG onClick={addGoal} style={{ padding: '8px 16px', fontSize: 12 }}>+ Add Goal</BtnG>
        )}
      </div>

      {/* ── 4 Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <MetricCard icon="🎯" label="Active Goals"     value={active.length.toString()}   color={C.amber}  sm={sm} sub={active.length === 0 ? 'All done! 🎉' : \`\${active.length} pending\`} />
        <MetricCard icon="💰" label="Total Budgeted"   value={peso(totBudget)}             color={C.blue}   sm={sm} />
        <MetricCard icon="✅" label="Completed Goals"  value={history.length.toString()}   color={C.green}  sm={sm} sub="all time" />
        <MetricCard icon="📊" label="Goals On-Track"   value={\`\${onTrackPct}%\`}            color={onTrackPct >= 80 ? C.green : C.red} sm={sm} sub={\`\${onTrack} of \${active.length} active\`} />
      </div>

      {/* ── View Toggle Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['active', \`🎯 Active Goals (\${active.length})\`], ['history', \`✅ Completed / History (\${history.length})\`]].map(([v, label]) => (
          <button key={v} onClick={() => setActiveView(v)}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: \`1px solid \${activeView === v ? C.amber : C.border}\`, background: activeView === v ? \`\${C.amber}22\` : 'transparent', color: activeView === v ? C.amber : C.muted, transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ACTIVE GOALS VIEW ── */}
      {activeView === 'active' && (
        <div>
          {active.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.green, marginBottom: 6 }}>All Goals Completed!</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>No active goals. Add a new one to start tracking.</div>
              {canWrite && <BtnG onClick={addGoal} style={{ padding: '8px 20px', fontSize: 12 }}>+ Add New Goal</BtnG>}
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {active.map(e => {
                const pct = e.budget > 0 ? Math.min(100, Math.round(e.actual / e.budget * 100)) : 0;
                const rem = (e.budget || 0) - (e.actual || 0);
                const onTrk = e.budget > 0 && e.actual <= e.budget;
                return (
                  <Card key={e.id} style={{ marginBottom: 0, border: \`1px solid \${onTrk ? C.green : C.amber}33\` }}>
                    {/* Goal Name + Actions */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                      <Inp value={e.name} onChange={ev => upd(e.id, 'name', ev.target.value)}
                        style={{ flex: 1, fontWeight: 700, fontSize: 13, background: 'transparent', border: 'none', borderBottom: \`1px solid \${C.border}55\`, borderRadius: 0, padding: '4px 0', color: C.text }}
                        disabled={readOnly} />
                      {canUpdate && (
                        <button onClick={() => setMajorExpenses(p => p.filter(x => x.id !== e.id))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, lineHeight: 1, padding: '2px 4px' }}>×</button>
                      )}
                    </div>

                    {/* Budget / Actual inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Budget</div>
                        <Inp type="number" value={e.budget || ''} onChange={ev => upd(e.id, 'budget', ev.target.value)}
                          placeholder="₱0" style={{ textAlign: 'right' }} disabled={readOnly} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Actual Spent</div>
                        <Inp type="number" value={e.actual || ''} onChange={ev => upd(e.id, 'actual', ev.target.value)}
                          placeholder="₱0" style={{ textAlign: 'right' }} disabled={readOnly} />
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ height: 8, borderRadius: 4, background: \`\${C.border}44\`, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: \`\${pct}%\`, background: e.done ? C.green : pct > 90 ? C.red : pct > 70 ? C.amber : C.blue, borderRadius: 4, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 12 }}>
                      <span style={{ color: C.text, fontWeight: 600 }}>{peso(e.actual || 0)} spent</span>
                      <span>{pct}% · <span style={{ color: rem >= 0 ? C.green : C.red }}>{rem >= 0 ? peso(rem) + ' left' : peso(Math.abs(rem)) + ' over'}</span></span>
                    </div>

                    {/* Mark Done */}
                    {canUpdate && (
                      <button onClick={() => markDone(e.id)}
                        style={{ width: '100%', padding: '7px', borderRadius: 6, border: \`1px solid \${C.green}55\`, background: \`\${C.green}18\`, color: C.green, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        ✓ Mark as Completed → Move to History
                      </button>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY / COMPLETED VIEW ── */}
      {activeView === 'history' && (
        <Card style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <SecTitle style={{ margin: 0 }}>✅ Completed Goals History</SecTitle>
            {histYears.length > 0 && (
              <select value={histYear} onChange={e => setHistYear(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 12 }}>
                <option value="all">All Years</option>
                {histYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>

          {histFiltered.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.muted, padding: '32px 0', fontSize: 13 }}>
              No completed goals yet. Mark active goals as done to see them here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {histFiltered.map(e => {
                const pct = e.budget > 0 ? Math.min(100, Math.round(e.actual / e.budget * 100)) : 0;
                return (
                  <div key={e.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: \`\${C.green}08\`, border: \`1px solid \${C.green}22\`, marginBottom: 4 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>✅</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        Spent {peso(e.actual || 0)} of {peso(e.budget || 0)} · {pct}%
                        {e.doneDate && <span style={{ marginLeft: 8, color: C.green }}>Done: {e.doneDate}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {canUpdate && (
                        <button onClick={() => reopen(e.id)}
                          style={{ background: 'none', border: \`1px solid \${C.border}\`, borderRadius: 5, color: C.muted, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>↩ Reopen</button>
                      )}
                      {canUpdate && (
                        <button onClick={() => setMajorExpenses(p => p.filter(x => x.id !== e.id))}
                          style={{ background: 'none', border: \`1px solid \${C.red}44\`, borderRadius: 5, color: C.red, padding: '3px 10px', cursor: 'pointer', fontSize: 10 }}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}`;

if (src.includes('function MajorTab')) {
  src = src.replace(OLD_MAJOR_TAB, NEW_MAJOR_TAB);
  if (src.includes('function MajorTab') && src.includes('activeView')) {
    console.log('[OK] Replaced MajorTab with Active/History split UI');
  } else {
    // Fallback: find and replace via line markers
    const si = src.indexOf('// ─── MAJOR EXPENSES ───────────────────────────────────────────────────────────\nfunction MajorTab');
    const ei = src.indexOf('\n// ─── CREDITS', si);
    if (si !== -1 && ei !== -1) {
      src = src.slice(0, si) + '// ─── MAJOR EXPENSES ───────────────────────────────────────────────────────────\n' + NEW_MAJOR_TAB + '\n' + src.slice(ei);
      console.log('[OK] Replaced MajorTab via marker range fallback');
    } else {
      console.error('[WARN] Could not replace MajorTab — manual check needed');
    }
  }
} else {
  console.error('[ERROR] MajorTab not found');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — ADD CC INSTALLMENT TRACKER SECTION TO DEBTS TAB
// Find the DebtsTab and inject the Installment Plans section
// We insert it right before the CC Charge Logger section header
// ─────────────────────────────────────────────────────────────────────────────
const INSTALLMENT_STATE = `
  // ── Installment Plan Tracker States ──────────────────────────────────────
  const [instPlans, setInstPlans]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('bg_installments') || '[]'); } catch { return []; }
  });
  const [showInstForm, setShowInstForm] = useState(false);
  const [newInst, setNewInst]           = useState({ cardId: '', item: '', total: 0, months: 12, startMonth: new Date().toISOString().slice(0,7) });
  const [instSuccessMsg, setInstSuccessMsg] = useState('');

  // Persist installment plans to localStorage
  const saveInstPlans = (plans) => {
    setInstPlans(plans);
    try { localStorage.setItem('bg_installments', JSON.stringify(plans)); } catch {}
  };

  const addInstPlan = () => {
    if (!newInst.cardId) return alert('Select a credit card');
    if (!newInst.item.trim()) return alert('Enter the item description');
    if (!newInst.total || newInst.total <= 0) return alert('Enter the total amount');
    if (!newInst.months || newInst.months <= 0) return alert('Enter number of months');
    const card = debts.find(d => d.id === newInst.cardId);
    const plan = {
      id: 'inst-' + Date.now(),
      cardId: newInst.cardId,
      cardName: card?.name || 'Unknown Card',
      item: newInst.item.trim(),
      total: Number(newInst.total),
      months: Number(newInst.months),
      startMonth: newInst.startMonth,
      paidMonths: 0,
      createdAt: new Date().toISOString().slice(0,10)
    };
    saveInstPlans([...instPlans, plan]);
    setNewInst({ cardId: '', item: '', total: 0, months: 12, startMonth: new Date().toISOString().slice(0,7) });
    setShowInstForm(false);
    setInstSuccessMsg('Installment plan added!');
    setTimeout(() => setInstSuccessMsg(''), 3000);
  };

  const payInstMonth = (id) => {
    saveInstPlans(instPlans.map(p => p.id === id ? { ...p, paidMonths: Math.min(p.paidMonths + 1, p.months) } : p));
  };

  const deleteInstPlan = (id) => {
    if (window.confirm('Delete this installment plan?')) {
      saveInstPlans(instPlans.filter(p => p.id !== id));
    }
  };

  const activeInstPlans = instPlans.filter(p => p.paidMonths < p.months);
  const completedInstPlans = instPlans.filter(p => p.paidMonths >= p.months);
  const totalMonthlyInst = activeInstPlans.reduce((s, p) => s + Math.ceil(p.total / p.months), 0);
`;

// Inject the installment states into DebtsTab after existing state declarations
const DEBTS_STATE_END = `  // Credit Card Transaction States
  const [selectedCardId, setSelectedCardId]`;

if (src.includes(DEBTS_STATE_END)) {
  src = src.replace(DEBTS_STATE_END, INSTALLMENT_STATE + '\n  // Credit Card Transaction States\n  const [selectedCardId, setSelectedCardId]');
  console.log('[OK] Injected installment plan states into DebtsTab');
} else {
  console.log('[WARN] Could not find DebtsTab state injection point');
}

// ─────────────────────────────────────────────────────────────────────────────
// Now inject the Installment Plans UI section
// We find the closing of the CC card metrics section and inject after it
// ─────────────────────────────────────────────────────────────────────────────
const INSTALLMENT_UI = `

      {/* ══════════════════════════════════════════════════════════════════
          INSTALLMENT PLAN TRACKER
          ══════════════════════════════════════════════════════════════════ */}
      <Card style={{ marginBottom: 0, border: \`1px solid \${C.amber}33\` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <SecTitle style={{ margin: 0 }}>📦 Installment Plan Tracker</SecTitle>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              Monthly installment obligation: <span style={{ color: C.amber, fontWeight: 700 }}>{peso(totalMonthlyInst)}/mo</span>
              {' · '}{activeInstPlans.length} active plan{activeInstPlans.length !== 1 ? 's' : ''}
            </div>
          </div>
          {canWrite && (
            <button onClick={() => setShowInstForm(p => !p)}
              style={{ padding: '6px 14px', borderRadius: 7, border: \`1px solid \${C.amber}55\`, background: showInstForm ? \`\${C.amber}22\` : 'transparent', color: C.amber, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {showInstForm ? 'Cancel' : '+ Add Plan'}
            </button>
          )}
        </div>

        {/* ── Add Installment Form ── */}
        {showInstForm && (
          <div style={{ background: \`\${C.card2}\`, borderRadius: 10, padding: 14, marginBottom: 14, border: \`1px solid \${C.border}\` }}>
            <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>New Installment Plan</div>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 2fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Credit Card</label>
                <select value={newInst.cardId} onChange={e => setNewInst(p => ({ ...p, cardId: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 7, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 12, outline: 'none', width: '100%' }}>
                  <option value="">Select card…</option>
                  {debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Item Description</label>
                <Inp value={newInst.item} onChange={e => setNewInst(p => ({ ...p, item: e.target.value }))} placeholder="e.g. Lazada Shopping, Samsung TV…" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Total Amount (₱)</label>
                <Inp type="number" value={newInst.total || ''} onChange={e => setNewInst(p => ({ ...p, total: e.target.value }))} placeholder="12000" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Months / Terms</label>
                <Inp type="number" value={newInst.months || ''} onChange={e => setNewInst(p => ({ ...p, months: e.target.value }))} placeholder="12" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Monthly Amount</label>
                <div style={{ padding: '8px 10px', borderRadius: 7, border: \`1px solid \${C.border}\`, background: \`\${C.green}18\`, color: C.green, fontSize: 14, fontWeight: 800, textAlign: 'right' }}>
                  {newInst.total && newInst.months ? peso(Math.ceil(Number(newInst.total) / Number(newInst.months))) : '₱—'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Start Month</label>
                <Inp type="month" value={newInst.startMonth} onChange={e => setNewInst(p => ({ ...p, startMonth: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <BtnG onClick={addInstPlan} style={{ padding: '8px 20px', fontSize: 12 }}>💾 Save Installment Plan</BtnG>
              {instSuccessMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {instSuccessMsg}</span>}
            </div>
          </div>
        )}

        {/* ── Active Installment Plans ── */}
        {activeInstPlans.length === 0 && !showInstForm && (
          <div style={{ textAlign: 'center', color: C.muted, padding: '20px 0', fontSize: 12 }}>No active installment plans. Click "+ Add Plan" to track your CC installments.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeInstPlans.map(plan => {
            const monthly   = Math.ceil(plan.total / plan.months);
            const remaining = plan.months - plan.paidMonths;
            const paidAmt   = plan.paidMonths * monthly;
            const remAmt    = plan.total - paidAmt;
            const pct       = Math.round(plan.paidMonths / plan.months * 100);
            return (
              <div key={plan.id} style={{ background: \`\${C.card2}\`, borderRadius: 10, padding: '12px 14px', border: \`1px solid \${C.amber}33\` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{plan.item}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      <span style={{ color: C.amber, fontWeight: 600 }}>{plan.cardName}</span>
                      {' · '}{plan.months} months @ {peso(monthly)}/mo
                      {' · '}Started {plan.startMonth}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.amber }}>{peso(monthly)}<span style={{ fontSize: 10, color: C.muted }}>/mo</span></div>
                    <div style={{ fontSize: 10, color: C.muted }}>{remaining} months left</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ height: 6, borderRadius: 3, background: \`\${C.border}44\`, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: \`\${pct}%\`, background: \`linear-gradient(90deg, \${C.amber}, \${C.green})\`, borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 10 }}>
                  <span>{plan.paidMonths}/{plan.months} months paid · {peso(paidAmt)} paid</span>
                  <span style={{ color: C.orange, fontWeight: 600 }}>{peso(remAmt)} remaining</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {canUpdate && (
                    <button onClick={() => payInstMonth(plan.id)}
                      style={{ flex: 1, padding: '6px', borderRadius: 6, border: \`1px solid \${C.green}55\`, background: \`\${C.green}18\`, color: C.green, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      ✓ Mark 1 Month Paid ({peso(monthly)})
                    </button>
                  )}
                  <button onClick={() => deleteInstPlan(plan.id)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: \`1px solid \${C.red}33\`, background: 'none', color: C.red, cursor: 'pointer', fontSize: 11 }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Completed Plans ── */}
        {completedInstPlans.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: \`1px solid \${C.border}33\` }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>✅ FULLY PAID PLANS ({completedInstPlans.length})</div>
            {completedInstPlans.map(plan => (
              <div key={plan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: \`\${C.green}08\`, marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{plan.item}</span>
                  <span style={{ fontSize: 11, color: C.green, marginLeft: 8 }}>· {peso(plan.total)} fully paid</span>
                </div>
                <button onClick={() => deleteInstPlan(plan.id)}
                  style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </Card>
`;

// Find a reliable injection point — before the CC Charge Logger Card
const CC_LOGGER_MARKER = `{/* ══════════════════════════════════════════════════════════════════`;
const CC_LOGGER_INSTANCES = src.split(CC_LOGGER_MARKER);

if (CC_LOGGER_INSTANCES.length >= 3) {
  // The second occurrence should be the CC Charge Logger
  src = CC_LOGGER_INSTANCES[0] + CC_LOGGER_MARKER + CC_LOGGER_INSTANCES[1] + INSTALLMENT_UI + CC_LOGGER_MARKER + CC_LOGGER_INSTANCES.slice(2).join(CC_LOGGER_MARKER);
  console.log('[OK] Injected Installment Tracker UI into DebtsTab');
} else if (CC_LOGGER_INSTANCES.length === 2) {
  // Only one section found, inject before it
  src = CC_LOGGER_INSTANCES[0] + INSTALLMENT_UI + CC_LOGGER_MARKER + CC_LOGGER_INSTANCES[1];
  console.log('[OK] Injected Installment Tracker UI before CC Logger section');
} else {
  // Fallback - inject after the metric cards block in DebtsTab
  const FALLBACK_MARKER = 'CC Charge Logger';
  if (src.includes(FALLBACK_MARKER)) {
    console.log('[WARN] Used fallback marker for installment injection');
  } else {
    console.log('[WARN] Could not auto-inject installment UI - needs manual review');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write file
// ─────────────────────────────────────────────────────────────────────────────
fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done! All 3 changes applied.');
