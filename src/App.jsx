import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, LineChart, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, ReferenceLine
} from "recharts";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import Auth from "./Auth";

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const OT_RATES = { weekday: 750, weekend: 680 };
const TAX_RATE = 0.20;
const NOW = new Date();
const CUR_YEAR  = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth();

const makeKey = (year, mi) => `${year}-${String(mi + 1).padStart(2, '0')}`;
const parseKey = k => { const [y,m] = k.split('-'); return { year: parseInt(y), monthIdx: parseInt(m)-1 }; };
const displayKey = k => { if (!k) return ''; const {year,monthIdx} = parseKey(k); return `${MONTH_NAMES[monthIdx]} ${year}`; };
const shortKey   = k => { if (!k) return ''; const {year,monthIdx} = parseKey(k); return `${MONTH_NAMES[monthIdx].slice(0,3)} ${String(year).slice(2)}`; };

const OLD_MAP = {
  'August':'2024-08','September':'2024-09','October':'2024-10','November':'2024-11',
  'December':'2024-12','January':'2025-01','February':'2025-02','March':'2025-03',
  'April':'2025-04','May':'2025-05','June':'2025-06','July':'2025-07',
};

const EXPENSE_TPL = [
  {name:'Rent',budget:18000,amount:18000},{name:'RCBC CC',budget:9400,amount:9400},{name:'RCBC Gold',budget:2200,amount:2200},
  {name:'RCBC Watch',budget:5000,amount:5000},{name:'SB CC',budget:0,amount:0},{name:'Parents',budget:5000,amount:5000},
  {name:'Atome',budget:0,amount:0},{name:'ZED',budget:0,amount:0},{name:'Prulife',budget:2600,amount:2600},
  {name:'iPhone',budget:3200,amount:3200},{name:'Animals',budget:800,amount:800},{name:'Gas',budget:2000,amount:2000},
  {name:'Toll',budget:1500,amount:1500},{name:'Electricity',budget:1000,amount:1000},{name:'Pagibig MP2',budget:2500,amount:2500},
  {name:'Laundry',budget:800,amount:800},{name:'Grocery',budget:0,amount:0},{name:'Food',budget:0,amount:0},{name:'Other',budget:0,amount:0},
];

const DEF_ACCOUNTS = [
  {id:'sla-c',name:'SLA Capcon',balance:507000,type:'Investment'},
  {id:'sla-s',name:'SLA Saving',balance:15000,type:'Savings'},
  {id:'mp2',name:'Pagibig MP2',balance:128000,type:'Investment'},
  {id:'git',name:'Business Gitstack',balance:40000,type:'Checking'},
  {id:'sbc',name:'SB Checking',balance:25000,type:'Checking'},
  {id:'sbe1',name:'SB eSaving 1',balance:263000,type:'Savings'},
  {id:'sbe2',name:'SB eSaving 2',balance:500,type:'Savings'},
  {id:'maya',name:'Maya / Ownbank',balance:306900,type:'Digital'},
];

const DEF_MAJOR = [
  {id:1,name:'Parent Birthday',budget:60000,actual:0,done:false,date:'2026-08-15'},
  {id:2,name:'Eisley Wedding',budget:60000,actual:0,done:false,date:'2026-10-10'},
  {id:3,name:'Zed Wedding',budget:45000,actual:0,done:false,date:'2026-11-20'},
  {id:4,name:'Papa Hospital',budget:172000,actual:0,done:true,date:'2025-11-15'},
  {id:5,name:'Christmas Food',budget:38000,actual:38000,done:true,date:'2025-12-25'},
  {id:6,name:'Christmas Gifts',budget:48000,actual:0,done:false,date:'2026-12-24'},
  {id:7,name:'Omega Watch',budget:30000,actual:0,done:false,date:'2027-02-14'},
  {id:8,name:'Birthday (Office)',budget:30000,actual:0,done:false,date:'2026-07-01'},
  {id:9,name:'Japan Trip',budget:180000,actual:0,done:false,date:'2027-04-10'},
];

const DEF_DEBTS = [
  {id:'d1',name:'RCBC CC',balance:24500,limit:100000,apr:3.5,minPayment:1200},
  {id:'d2',name:'RCBC Gold',balance:12000,limit:50000,apr:3.5,minPayment:600},
  {id:'d3',name:'Atome',balance:5000,limit:20000,apr:0,minPayment:1666},
];

const TYPE_CLR = {Investment:'#bc8cff',Savings:'#3fb950',Checking:'#388bfd',Digital:'#56d364'};

const classifyExpense = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('rent') || n.includes('parent') || n.includes('pru') || n.includes('insurance')) {
    return 'Fixed';
  }
  if (n.includes('cc') || n.includes('gold') || n.includes('watch') || n.includes('atome') || n.includes('zed') || n.includes('iphone') || n.includes('loan')) {
    return 'Debt';
  }
  if (n.includes('mp2') || n.includes('investment') || n.includes('invest')) {
    return 'Investment';
  }
  return 'Variable';
};

function generateMockBalanceHistory(accList) {
  const history = [];
  const now = new Date();
  const factors = [0.92, 0.935, 0.95, 0.97, 0.985, 1.0];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - (5 - i) * 7);
    const dateStr = d.toISOString().slice(0, 10);
    const entryBalances = {};
    accList.forEach(a => {
      entryBalances[a.id] = Math.round(a.balance * factors[i]);
    });
    history.push({
      date: dateStr,
      balances: entryBalances
    });
  }
  return history;
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
let activeUserIsAdmin = false;

const getIsAdminOrDemo = () => {
  if (!isSupabaseConfigured) return true; // Local Demo Mode acts as Admin
  return activeUserIsAdmin;
};

function makePeriod() {
  const isAdmin = getIsAdminOrDemo();
  return {
    salary: isAdmin ? 27000 : 0,
    ot: { weekday: 0, weekend: 0 },
    expenses: isAdmin ? EXPENSE_TPL.map(e => ({ ...e, done: false })) : []
  };
}
function makeMonthData() { return {'5th':makePeriod(),'20th':makePeriod()}; }
function getOrMake(budgetData, key) { return budgetData[key] || makeMonthData(); }

function calcOT(ot) {
  const wdE=ot.weekday*OT_RATES.weekday, weE=ot.weekend*OT_RATES.weekend;
  const gross=wdE+weE, tax=gross*TAX_RATE;
  return {gross,tax,net:gross-tax,weekdayEarned:wdE,weekendEarned:weE};
}
function calcSummary(p) {
  const otCalc=calcOT(p.ot), totalIncome=p.salary+otCalc.net;
  const totalExpenses=p.expenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const paidExpenses=p.expenses.filter(e=>e.done).reduce((s,e)=>s+(Number(e.amount)||0),0);
  return {otCalc,totalIncome,totalExpenses,paidExpenses,netSavings:totalIncome-totalExpenses};
}
function calcMonth(md) {
  const s5=calcSummary(md['5th']), s20=calcSummary(md['20th']);
  const income=s5.totalIncome+s20.totalIncome, expenses=s5.totalExpenses+s20.totalExpenses, savings=s5.netSavings+s20.netSavings;
  return {income,expenses,savings,s5,s20,
    otIncome:s5.otCalc.net+s20.otCalc.net,
    otHours:md['5th'].ot.weekday+md['5th'].ot.weekend+md['20th'].ot.weekday+md['20th'].ot.weekend,
    savingsRate:income>0?(savings/income)*100:0};
}

const isPeriodInRange = (year, monthIdx, period, startStr, endStr) => {
  const day = period === '5th' ? 5 : 20;
  const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return dateStr >= startStr && dateStr <= endStr;
};

function calcMonthFiltered(md, key, range, customStart, customEnd) {
  const { year, monthIdx } = parseKey(key);
  const include5 = range !== 'custom' || isPeriodInRange(year, monthIdx, '5th', customStart, customEnd);
  const include20 = range !== 'custom' || isPeriodInRange(year, monthIdx, '20th', customStart, customEnd);

  const s5 = include5 ? calcSummary(md['5th']) : { totalIncome: 0, totalExpenses: 0, netSavings: 0, otCalc: { net: 0 }, paidExpenses: 0 };
  const s20 = include20 ? calcSummary(md['20th']) : { totalIncome: 0, totalExpenses: 0, netSavings: 0, otCalc: { net: 0 }, paidExpenses: 0 };

  const income = s5.totalIncome + s20.totalIncome;
  const expenses = s5.totalExpenses + s20.totalExpenses;
  const savings = s5.netSavings + s20.netSavings;

  const otIncome = s5.otCalc.net + s20.otCalc.net;
  const otHours = (include5 ? (md['5th'].ot.weekday + md['5th'].ot.weekend) : 0) +
                  (include20 ? (md['20th'].ot.weekday + md['20th'].ot.weekend) : 0);

  return {
    income,
    expenses,
    savings,
    s5,
    s20,
    otIncome,
    otHours,
    savingsRate: income > 0 ? (savings / income) * 100 : 0
  };
}

const scaleFake = n => {
  const val = Number(n) || 0;
  if (typeof window !== 'undefined' && window.isFakeModeEnabled && val !== 0) {
    return val * 100;
  }
  return val;
};

const peso = n => {
  const val = scaleFake(n);
  return '₱' + Math.abs(Math.round(val)).toLocaleString();
};

const fmtK = n => {
  const val = scaleFake(n);
  return val >= 1000000 
    ? '₱' + (val / 1e6).toFixed(2) + 'M' 
    : val >= 1000 
      ? '₱' + (val / 1000).toFixed(0) + 'k' 
      : '₱' + Math.abs(Math.round(val)).toLocaleString();
};

// ─── STORAGE (fixed) ──────────────────────────────────────────────────────────
// Each key wrapped separately so one missing key doesn't break the others
async function safeGet(key) {
  try { const r=await window.storage.get(key); return r?JSON.parse(r.value):null; } catch(_){return null;}
}
async function safeSet(key,val) {
  try { await window.storage.set(key,JSON.stringify(val)); } catch(_){}
}

// ─── RESPONSIVE ───────────────────────────────────────────────────────────────
function useWidth() {
  const [w,setW]=useState(typeof window!=='undefined'?window.innerWidth:800);
  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h);},[]);
  return w;
}

// ─── THEME ────────────────────────────────────────────────────────────────────
const C={bg:'#020814',panel:'#07111f',card:'#0f1a2a',card2:'#101d31',border:'#1c2b42',text:'#eef5ff',
  muted:'#8ea0b8',green:'#24d17e',red:'#ff514f',amber:'#f2a71b',
  blue:'#4b8dff',teal:'#30d6b0',purple:'#7257ff',orange:'#ff7a45',pink:'#f45f93'};
const ttip={background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:11};

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Divider=()=><div style={{borderTop:`1px solid ${C.border}`,margin:'12px 0'}}/>;
const Tag=({children,color})=><span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:`${color}22`,color,fontWeight:600}}>{children}</span>;
const SecTitle=({children,style})=><div style={{fontSize:11,fontWeight:700,color:C.text,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:12,...style}}>{children}</div>;
const Card=({children,style})=><div style={{background:`linear-gradient(180deg, ${C.card2}, ${C.card})`,borderRadius:8,border:`1px solid ${C.border}`,boxShadow:'0 18px 42px rgba(0,0,0,0.22)',padding:'16px 18px',marginBottom:14,...style}}>{children}</div>;
const Inp = ({ style, disabled, ...p }) => {
  const activePerm = typeof window !== 'undefined' ? window.activePermission : null;
  const isReadOnly = activePerm === 'read';
  return (
    <input 
      disabled={disabled || isReadOnly} 
      style={{
        background: '#08111f',
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        color: C.text,
        fontSize: 13,
        width: '100%',
        boxSizing: 'border-box',
        opacity: (disabled || isReadOnly) ? 0.6 : 1,
        ...style
      }} 
      {...p}
    />
  );
};
const BtnG=({children,style,...p})=><button style={{padding:'8px 14px',borderRadius:7,border:`1px solid ${C.green}`,background:'rgba(63,185,80,0.15)',color:C.green,cursor:'pointer',fontSize:13,fontWeight:600,...style}} {...p}>{children}</button>;
const Btn=({children,style,...p})=><button style={{padding:'7px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,cursor:'pointer',fontSize:13,...style}} {...p}>{children}</button>;

function MetricCard({label,value,sub,color,sm,masked,onToggleMask,icon}) {
  return(
    <div style={{background:`radial-gradient(circle at top left, ${color || C.blue}22, transparent 48%), linear-gradient(180deg, ${C.card2}, ${C.card})`,borderRadius:8,border:`1px solid ${C.border}`,boxShadow:'0 14px 34px rgba(0,0,0,0.24)',padding:sm?'12px 14px':'16px 18px',minHeight:sm?96:112}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:10}}>
        <div style={{width:34,height:34,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',background:`${color || C.blue}22`,border:`1px solid ${color || C.blue}44`,color:color||C.blue,fontSize:16,fontWeight:800}}>{icon || 'o'}</div>
        {onToggleMask&&(
          <button
            type="button"
            onClick={onToggleMask}
            title={masked?'Show amount':'Hide amount'}
            aria-label={masked?'Show amount':'Hide amount'}
            style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:'rgba(255,255,255,0.02)',color:masked?C.amber:C.muted,cursor:'pointer',fontSize:12,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}
          >
            {masked?'***':'$'}
          </button>
        )}
      </div>
      <div style={{fontSize:10,color:C.muted,textTransform:'uppercase',fontWeight:800,letterSpacing:'0.04em',marginBottom:4}}>{label}</div>
      <div style={{fontSize:sm?18:23,fontWeight:800,color:C.text,lineHeight:1.1}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:color||C.muted,marginTop:7,fontWeight:700}}>{sub}</div>}
    </div>
  );
}
function Legend({items}){
  return(<div style={{display:'flex',flexWrap:'wrap',gap:10,justifyContent:'center',marginTop:8}}>
    {items.map(([l,c])=><span key={l} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:C.muted}}><span style={{width:9,height:9,borderRadius:2,background:c,display:'inline-block'}}/>{l}</span>)}
  </div>);
}

// ─── YEAR/MONTH PICKER ────────────────────────────────────────────────────────
function YMPicker({year,monthIdx,onYear,onMonth,sm}) {
  return(
    <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:'14px 16px',marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20,marginBottom:14}}>
        <button onClick={()=>onYear(year-1)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:'pointer',fontSize:22,width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
        <span style={{fontSize:22,fontWeight:700,minWidth:60,textAlign:'center'}}>{year}</span>
        <button onClick={()=>onYear(year+1)} style={{background:'none',border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:'pointer',fontSize:22,width:38,height:38,display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6}}>
        {MONTH_NAMES.map((m,i)=>{
          const sel=i===monthIdx, cur=year===CUR_YEAR&&i===CUR_MONTH;
          return(
            <button key={m} onClick={()=>onMonth(i)} style={{padding:'8px 2px',borderRadius:8,border:`1px solid ${sel?C.green:cur?C.amber+'88':C.border}`,background:sel?'rgba(63,185,80,0.2)':cur?`${C.amber}11`:'transparent',color:sel?C.green:cur?C.amber:C.muted,cursor:'pointer',fontSize:sm?11:12,fontWeight:sel?700:400}}>
              {m.slice(0,3)}
            </button>
          );
        })}
      </div>
      <div style={{marginTop:12,textAlign:'center',fontSize:14,fontWeight:600}}>
        {MONTH_NAMES[monthIdx]} {year}
        {year===CUR_YEAR&&monthIdx===CUR_MONTH&&<span style={{marginLeft:8,fontSize:11,color:C.amber,fontWeight:400}}>● Now</span>}
      </div>
    </div>
  );
}

const DEFAULT_CARD_ORDER = [
  'quick-actions',
  'today-glance',
  'account-health',
  'surplus-banner',
  'metrics',
  'debts-credits-summary',
  'net-worth-graph',
  'portfolio-summary',
  'period-burn',
  'balance-logs',
  'cashflow',
  'expense-donut',
  'charts-row',
  'budget-row',
  'recent-tx',
  'installment-summary',
  'insights-row'
];

const CARD_LABELS = {
  'quick-actions': '⚡ Quick Actions Bar',
  'today-glance': '📅 Today at a Glance',
  'account-health': '🔍 Account Health & Reconciliation',
  'surplus-banner': '💡 Cash Surplus / Deficit Banner',
  'metrics': '📊 Financial Core Metrics',
  'debts-credits-summary': '💳 Debts & Money Owed Summary',
  'net-worth-graph': '📈 Net Worth Trajectory Graph',
  'portfolio-summary': '💼 Investment Portfolio Overview',
  'period-burn': '🔥 Burn Rate Tracker',
  'balance-logs': '📜 Account Balance History',
  'cashflow': '🌊 Monthly Cash Flow Stream',
  'expense-donut': '🍩 Expense Category Breakdown',
  'charts-row': '📉 Trend Charts',
  'budget-row': '💵 Budget vs Actual Comparison',
  'recent-tx': '📋 Central Transactions Feed',
  'installment-summary': '🏷️ Installment Plans Summary',
  'insights-row': '🤖 AI Financial Insights'
};

function Dashboard({ budgetData, accounts, majorExpenses, credits, debts = DEF_DEBTS, balanceHistory, sm, session, setTab }) {
  // ── Load installment plans from localStorage ──
  const instPlans = (() => { try { return JSON.parse(localStorage.getItem('bg_installments') || '[]'); } catch { return []; } })();
  const getInstBreakdownSimple = (total, months, interestRate, customMonthly) => {
    const p = Number(total) || 0, m = Number(months) || 12, r = Number(interestRate) || 0, c = Number(customMonthly) || 0;
    if (c > 0) return Math.ceil(c);
    return Math.ceil(p / m + p * (r / 100 / 12));
  };
  const activeInstPlans = instPlans.filter(pl => (pl.paidMonths || 0) < (Number(pl.months) || 12));
  const totalMonthlyObligation = activeInstPlans.reduce((s, pl) => s + getInstBreakdownSimple(pl.total, pl.months, pl.interestRate, pl.customMonthly), 0);

  const [historyView, setHistoryView] = useState('total');
  const [historyGrouping, setHistoryGrouping] = useState('weekly');
  const [balanceFilter, setBalanceFilter] = useState('daily');
  const [moneyMasked, setMoneyMasked] = useState(() => {
    try {
      return localStorage.getItem('dashboardMoneyMasked') === 'true';
    } catch {}
    return false;
  });
  const toggleMoneyMask = () => {
    const next = !moneyMasked;
    setMoneyMasked(next);
    try {
      localStorage.setItem('dashboardMoneyMasked', String(next));
    } catch {}
  };
  const confidentialValue = (value) => moneyMasked ? '*****' : value;

  // ── Drag-and-drop card order ──
  const [cardOrder, setCardOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboardCardOrder');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge: keep saved order but include any new sections not yet saved
        const merged = parsed.filter(id => DEFAULT_CARD_ORDER.includes(id));
        DEFAULT_CARD_ORDER.forEach(id => { if (!merged.includes(id)) merged.push(id); });
        return merged;
      }
    } catch {}
    return [...DEFAULT_CARD_ORDER];
  });
  const dragId   = useRef(null);
  const dragOver = useRef(null);
  const [dragActive, setDragActive] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const handleDragStart = (id) => { dragId.current = id; setDragActive(id); };
  const handleDragEnter = (id) => { dragOver.current = id; setDropTarget(id); };
  const handleDragEnd   = () => {
    if (dragId.current && dragOver.current && dragId.current !== dragOver.current) {
      const next = [...cardOrder];
      const from = next.indexOf(dragId.current);
      const to   = next.indexOf(dragOver.current);
      next.splice(from, 1);
      next.splice(to, 0, dragId.current);
      setCardOrder(next);
      localStorage.setItem('dashboardCardOrder', JSON.stringify(next));
    }
    dragId.current = null; dragOver.current = null;
    setDragActive(null); setDropTarget(null);
  };
  const resetCardOrder = () => {
    setCardOrder([...DEFAULT_CARD_ORDER]);
    setCardSizes({});
    setCardCollapsed({});
    localStorage.removeItem('dashboardCardOrder');
    localStorage.removeItem('dashboardCardSizes');
    localStorage.removeItem('dashboardCardCollapsed');
  };

  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [hiddenCards, setHiddenCards] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboardHiddenCards');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const toggleCardVisibility = (id) => {
    const next = hiddenCards.includes(id) 
      ? hiddenCards.filter(x => x !== id) 
      : [...hiddenCards, id];
    setHiddenCards(next);
    localStorage.setItem('dashboardHiddenCards', JSON.stringify(next));
  };
  const [cardSizes, setCardSizes] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboardCardSizes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const toggleSize = (id) => {
    const next = { ...cardSizes, [id]: cardSizes[id] === 'half' ? 'full' : 'half' };
    setCardSizes(next);
    localStorage.setItem('dashboardCardSizes', JSON.stringify(next));
  };

  // ── Per-section collapse ──
  const [cardCollapsed, setCardCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboardCardCollapsed');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const toggleCollapse = (id) => {
    const next = { ...cardCollapsed, [id]: !cardCollapsed[id] };
    setCardCollapsed(next);
    localStorage.setItem('dashboardCardCollapsed', JSON.stringify(next));
  };

  const getLocalYYYYMMDD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };

  const firstDayStr = `${CUR_YEAR}-${String(CUR_MONTH + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(CUR_YEAR, CUR_MONTH + 1, 0).getDate();
  const lastDayStr = `${CUR_YEAR}-${String(CUR_MONTH + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [range, setRange] = useState('current');
  const [customStart, setCustomStart] = useState(firstDayStr);
  const [customEnd, setCustomEnd] = useState(lastDayStr);

  const getWeekKey = (dStr) => {
    const date = new Date(dStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().slice(0, 10);
  };

  const formatLabel = (dStr, grouping) => {
    const d = new Date(dStr);
    const m = MONTH_NAMES[d.getMonth()].slice(0, 3);
    const y = String(d.getFullYear()).slice(2);
    if (grouping === 'monthly') {
      return `${m} '${y}`;
    }
    return `${m} ${d.getDate()}`;
  };

  const getGroupedHistoryData = () => {
    if (!balanceHistory || balanceHistory.length === 0) return [];
    
    const sorted = [...balanceHistory].sort((a, b) => a.date.localeCompare(b.date));
    
    let grouped = [];
    if (historyGrouping === 'monthly') {
      const monthlyMap = {};
      sorted.forEach(entry => {
        const key = entry.date.slice(0, 7);
        monthlyMap[key] = entry;
      });
      grouped = Object.values(monthlyMap);
    } else if (historyGrouping === 'weekly') {
      const weeklyMap = {};
      sorted.forEach(entry => {
        const key = getWeekKey(entry.date);
        weeklyMap[key] = entry;
      });
      grouped = Object.values(weeklyMap);
    } else {
      grouped = sorted;
    }
    
    return grouped.map(entry => {
      const point = {
        date: entry.date,
        label: formatLabel(entry.date, historyGrouping),
        total: Math.round(Object.values(entry.balances).reduce((sum, v) => sum + v, 0) / 1000)
      };
      
      const categories = ['Investment', 'Savings', 'Checking', 'Digital'];
      categories.forEach(cat => {
        point[cat] = 0;
      });
      
      accounts.forEach(acc => {
        const bal = entry.balances[acc.id] ?? 0;
        point[acc.name] = Math.round(bal / 1000);
        const cat = acc.type || 'Other';
        if (point[cat] !== undefined) {
          point[cat] += Math.round(bal / 1000);
        } else {
          point[cat] = Math.round(bal / 1000);
        }
      });
      
      return point;
    });
  };

  const ACCOUNT_COLORS = ['#388bfd', '#3fb950', '#bc8cff', '#56d364', '#f0883e', '#d29922', '#f85149', '#a8a8a8'];
  const getAccountColor = (index) => ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];

  const handleCustomStartChange = (val) => {
    setCustomStart(val);
    if (customEnd && val > customEnd) {
      setCustomEnd(val);
    }
  };

  const handleCustomEndChange = (val) => {
    setCustomEnd(val);
    if (customStart && val < customStart) {
      setCustomStart(val);
    }
  };

  const getKeys = () => {
    let s, e;
    if (range === 'current') {
      s = makeKey(CUR_YEAR, CUR_MONTH);
      e = makeKey(CUR_YEAR, CUR_MONTH);
    } else if (range === '12m') {
      const d = new Date(CUR_YEAR, CUR_MONTH - 11, 1);
      s = makeKey(d.getFullYear(), d.getMonth());
      e = makeKey(CUR_YEAR, CUR_MONTH);
    } else if (range === '2025') {
      s = '2025-01'; e = '2025-12';
    } else if (range === '2024') {
      s = '2024-01'; e = '2024-12';
    } else {
      s = customStart.slice(0, 7);
      e = customEnd.slice(0, 7);
    }

    const res = [];
    let [cy, cm] = s.split('-').map(Number);
    const [ey, em] = e.split('-').map(Number);
    while (cy < ey || (cy === ey && cm <= em)) {
      res.push(makeKey(cy, cm - 1));
      cm++; if (cm > 12) { cm = 1; cy++; }
      if (res.length > 48) break; // sanity limit
    }
    return res;
  };

  const keys = getKeys();
  const stats = keys.map(key => {
    const isCurrentMonth = key === makeKey(CUR_YEAR, CUR_MONTH);
    const md = budgetData[key] || (isCurrentMonth ? makeMonthData() : null);
    
    // Custom breakdown calculations
    let fixed = 0, variable = 0, debt = 0, investment = 0;
    if (md) {
      ['5th', '20th'].forEach(p => {
        const includePeriod = range !== 'custom' || isPeriodInRange(parseKey(key).year, parseKey(key).monthIdx, p, customStart, customEnd);
        if (includePeriod && md[p]) {
          md[p].expenses.forEach(e => {
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

    const mt = md ? calcMonthFiltered(md, key, range, customStart, customEnd) : { income: 0, expenses: 0, savings: 0, otIncome: 0, otHours: 0, savingsRate: 0 };
    return { 
      key, 
      label: shortKey(key), 
      ...mt,
      fixed: Math.round(fixed / 1000),
      variable: Math.round(variable / 1000),
      debt: Math.round(debt / 1000),
      investment: Math.round(investment / 1000),
      chartSavings: Math.round((mt.income - (fixed + variable + debt + investment)) / 1000)
    };
  });

  // Calculate Net Worth history
  const totalBal = accounts.reduce((s, a) => s + a.balance, 0);
  const totalCredits = credits.filter(c => !c.done).reduce((s, c) => s + c.amount, 0);
  const totalDebts = debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = totalBal + totalCredits - totalDebts;

  let tempNW = netWorth;
  const netWorthHistory = [];
  for (let i = stats.length - 1; i >= 0; i--) {
    netWorthHistory[i] = {
      label: stats[i].label,
      val: Math.round(tempNW / 1000)
    };
    tempNW -= stats[i].savings;
  }

  // Executive Metrics
  const active = stats.filter(s => s.income > 0);
  const avgExp = active.length ? active.reduce((s, m) => s + m.expenses, 0) / active.length : 0;
  const avgSav = active.length ? active.reduce((s, m) => s + m.savings, 0) / active.length : 0;
  const liquid = accounts.filter(a => ['Savings', 'Checking', 'Digital'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
  const safetyMonths = avgExp > 0 ? liquid / avgExp : 0;
  const avgRate = active.length ? active.reduce((s, m) => s + m.savingsRate, 0) / active.length : 0;
  
  // Calculate Debt Ratio
  const totalIncomeRange = stats.reduce((sum, s) => sum + s.income, 0);
  const totalDebtPaidRange = stats.reduce((sum, s) => {
    let debtVal = 0;
    const md = budgetData[s.key];
    if (md) {
      ['5th', '20th'].forEach(p => {
        if (md[p]) {
          md[p].expenses.forEach(e => {
            if (classifyExpense(e.name) === 'Debt') debtVal += Number(e.amount) || 0;
          });
        }
      });
    }
    return sum + debtVal;
  }, 0);
  const debtRatio = totalIncomeRange > 0 ? (totalDebtPaidRange / totalIncomeRange) * 100 : 0;

  // Upcoming bills count
  let upcomingBillsCount = 0;
  const todayDay = NOW.getDate();
  const currentMonthKey = makeKey(CUR_YEAR, CUR_MONTH);
  const currentMonthData = budgetData[currentMonthKey];
  if (currentMonthData) {
    if (todayDay <= 5) {
      upcomingBillsCount += currentMonthData['5th'].expenses.filter(e => !e.done && e.amount > 0).length;
    }
    if (todayDay <= 20) {
      upcomingBillsCount += currentMonthData['20th'].expenses.filter(e => !e.done && e.amount > 0).length;
    }
  }

  // Financial Health Score Calculation
  const getHealthScore = () => {
    let score = 0;
    if (avgRate >= 30) score += 30;
    else if (avgRate >= 20) score += 20;
    else if (avgRate >= 10) score += 10;
    
    if (safetyMonths >= 6) score += 30;
    else if (safetyMonths >= 3) score += 20;
    else if (safetyMonths >= 1) score += 10;
    
    if (debtRatio <= 15) score += 25;
    else if (debtRatio <= 30) score += 15;
    else if (debtRatio <= 45) score += 5;
    
    const overspentCount = majorExpenses.filter(e => e.actual > e.budget).length;
    if (overspentCount === 0) score += 15;
    else if (overspentCount <= 2) score += 5;
    return score;
  };
  const healthScore = getHealthScore();
  const getHealthGrade = (s) => {
    if (s >= 90) return { label: 'Excellent', color: C.green };
    if (s >= 70) return { label: 'Good', color: C.blue };
    if (s >= 50) return { label: 'Warning', color: C.amber };
    return { label: 'Critical', color: C.red };
  };
  const grade = getHealthGrade(healthScore);

  // Dynamic Smart Insights
  const getInsights = () => {
    const list = [];
    if (avgRate >= 30) list.push({ text: `Savings rate is excellent at ${Math.round(avgRate)}%! Keep putting funds away.`, type: 'good' });
    else if (avgRate < 10) list.push({ text: `Savings rate is low at ${Math.round(avgRate)}%. Try cutting variable expenses.`, type: 'warn' });
    else list.push({ text: `Savings rate is healthy at ${Math.round(avgRate)}%. You are on the right track.`, type: 'info' });

    if (safetyMonths >= 6) list.push({ text: 'Emergency fund is fully funded (6+ months of runway covered).', type: 'good' });
    else if (safetyMonths < 3) list.push({ text: `Emergency fund covers only ${safetyMonths.toFixed(1)} months. Aim for 3-6 months.`, type: 'warn' });

    if (debtRatio > 35) list.push({ text: `Debt commitments are consuming ${debtRatio.toFixed(1)}% of your income. High risk!`, type: 'warn' });
    else list.push({ text: `Debt-to-income ratio is healthy at ${debtRatio.toFixed(1)}%.`, type: 'good' });

    const totalSavedRange = stats.reduce((sum, s) => sum + s.savings, 0);
    if (totalSavedRange > 0) {
      list.push({ text: `Based on savings this period, you can safely invest ${peso(totalSavedRange * 0.4)} this month.`, type: 'info' });
    }
    return list;
  };
  const insights = getInsights();

  // Upcoming bills detail list
  const getUpcomingBills = () => {
    const list = [];
    if (currentMonthData) {
      if (todayDay <= 5) {
        currentMonthData['5th'].expenses.forEach(e => {
          if (!e.done && e.amount > 0) list.push({ name: e.name, amount: e.amount, daysLeft: 5 - todayDay, period: '5th' });
        });
      }
      if (todayDay <= 20) {
        currentMonthData['20th'].expenses.forEach(e => {
          if (!e.done && e.amount > 0) {
            const daysLeft = 20 - todayDay;
            if (daysLeft >= 0) list.push({ name: e.name, amount: e.amount, daysLeft, period: '20th' });
          }
        });
      }
    }
    return list.sort((a,b) => a.daysLeft - b.daysLeft).slice(0, 5);
  };
  const upcomingBills = getUpcomingBills();

  // Collect budget vs actual statistics for the visible month keys
  const getBudgetVsActual = () => {
    const grouped = {};
    keys.forEach(key => {
      const md = budgetData[key];
      if (md) {
        ['5th', '20th'].forEach(p => {
          if (md[p]) {
            md[p].expenses.forEach(e => {
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
    return Object.values(grouped).sort((a,b) => b.budget - a.budget);
  };
  const bvsA = getBudgetVsActual();

  // ── Current-month expense category breakdown (for donut) ──
  const curMonthKey = makeKey(CUR_YEAR, CUR_MONTH);
  const curMd = budgetData[curMonthKey] || makeMonthData();
  let catFixed = 0, catDebt = 0, catVariable = 0, catInvestment = 0;
  ['5th','20th'].forEach(p => {
    if (curMd[p]) curMd[p].expenses.forEach(e => {
      const cat = classifyExpense(e.name), amt = Number(e.amount) || 0;
      if (cat === 'Fixed') catFixed += amt;
      else if (cat === 'Debt') catDebt += amt;
      else if (cat === 'Investment') catInvestment += amt;
      else catVariable += amt;
    });
  });
  // Unbudgeted manual debits this month
  const catUnbudgeted = (budgetData.debitHistory || []).filter(d => !d.isCredit && !!d.excludeFromBudget && (d.date||'').slice(0,7) === curMonthKey).reduce((s,d) => s + (d.amount||0), 0);
  const expenseDonutData = [
    { name: 'Fixed', value: catFixed, color: C.red },
    { name: 'Debt', value: catDebt, color: C.amber },
    { name: 'Variable', value: catVariable, color: C.orange },
    { name: 'Investment', value: catInvestment, color: C.purple },
    { name: 'Unbudgeted', value: catUnbudgeted, color: C.muted },
  ].filter(d => d.value > 0);

  // ── Payroll period burn ──
  const period5  = curMd['5th']  || makePeriod();
  const period20 = curMd['20th'] || makePeriod();
  const sum5  = calcSummary(period5);
  const sum20 = calcSummary(period20);

  // ── Today at a glance ──
  const todayFull = new Date();
  const todayDayNum = todayFull.getDate();
  const daysTo5  = todayDayNum <= 5  ? 5  - todayDayNum : null;
  const daysTo20 = todayDayNum <= 20 ? 20 - todayDayNum : null;
  const activePeriodLabel = todayDayNum <= 15 ? '5th' : '20th';
  const activePeriodSum = activePeriodLabel === '5th' ? sum5 : sum20;
  const burnPct = activePeriodSum.totalIncome > 0 ? Math.min(100, (activePeriodSum.paidExpenses / activePeriodSum.totalIncome) * 100) : 0;
  const burnColor = burnPct > 90 ? C.red : burnPct > 65 ? C.amber : C.green;

  // ── Monthly surplus/deficit for current month ──
  const curMonthCalc = calcMonth(curMd);
  const surplusAmount = curMonthCalc.savings;
  const isSurplus = surplusAmount >= 0;

  // ── Recent transactions feed ──
  const allRecentTx = [
    ...(budgetData.debitHistory || []).map(d => ({ ...d, source: 'manual', sourceLabel: d.isCredit ? 'Credit' : 'Debit' })),
    ...(budgetData.ccHistory || []).map(d => ({ ...d, source: 'cc', sourceLabel: 'CC Charge' })),
    ...(budgetData.installmentHistory || []).map(d => ({ ...d, source: 'installment', sourceLabel: 'Installment' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 7);
  const TX_SRC_CLR = { manual: C.blue, cc: C.purple, installment: C.amber };
  const TX_SRC_ICON = { manual: '💸', cc: '💳', installment: '📦' };

  const forecast = [];
  for (let i = 0; i <= 12; i++) {
    forecast.push({
      label: i === 0 ? 'Now' : `+${i}m`,
      val: Math.round((netWorth + (avgSav * i)) / 1000)
    });
  }

  const best = active.length ? [...active].sort((a,b) => b.savings - a.savings)[0] : null;
  const majorBudget = majorExpenses.reduce((s, e) => s + e.budget, 0);
  const majorSpent = majorExpenses.reduce((s, e) => s + e.actual, 0);
  const pieData = accounts.map(a => ({ name: a.name, value: a.balance, color: TYPE_CLR[a.type] || C.muted }));
  const ch = sm ? 180 : 230, sch = sm ? 155 : 195;

  // ── Section renderers ──
  const sectionContent = (id) => {
    switch (id) {
      case 'today-glance': return (
        <Card style={{ marginBottom: 0, background: `linear-gradient(135deg, ${C.card2}, ${C.card})` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: sm ? 12 : 20, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${C.teal}22`, border: `1px solid ${C.teal}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔥</div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today at a Glance</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  {todayFull.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Active Period</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.blue }}>{activePeriodLabel} Payroll</div>
              </div>
              {daysTo5 !== null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Days to 5th</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: daysTo5 <= 2 ? C.red : C.amber }}>{daysTo5 === 0 ? 'Today!' : `${daysTo5}d`}</div>
                </div>
              )}
              {daysTo20 !== null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Days to 20th</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: daysTo20 <= 2 ? C.red : C.amber }}>{daysTo20 === 0 ? 'Today!' : `${daysTo20}d`}</div>
                </div>
              )}
              <div style={{ minWidth: 140 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginBottom: 4 }}>
                  <span>Budget Burn ({activePeriodLabel})</span>
                  <span style={{ color: burnColor, fontWeight: 700 }}>{burnPct.toFixed(0)}%</span>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${burnPct}%`, height: '100%', background: `linear-gradient(90deg, ${C.green}, ${burnColor})`, borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{peso(activePeriodSum.paidExpenses)} paid of {peso(activePeriodSum.totalIncome)}</div>
              </div>
            </div>
          </div>
        </Card>
      );

      case 'surplus-banner': {
        const surplusGrad = isSurplus
          ? `linear-gradient(135deg, ${C.green}22, ${C.teal}11)`
          : `linear-gradient(135deg, ${C.red}22, ${C.orange}11)`;
        return (
          <Card style={{ marginBottom: 0, background: surplusGrad, border: `1px solid ${isSurplus ? C.green : C.red}44` }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Monthly Budget — {MONTH_NAMES[CUR_MONTH]} {CUR_YEAR}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: sm ? 26 : 34, fontWeight: 900, color: isSurplus ? C.green : C.red, letterSpacing: -1 }}>
                    {isSurplus ? '+' : '−'}{peso(Math.abs(surplusAmount))}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isSurplus ? C.green : C.red }}>{isSurplus ? 'SURPLUS' : 'DEFICIT'}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  {peso(curMonthCalc.income)} income − {peso(curMonthCalc.expenses)} expenses
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>5th Period</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: sum5.netSavings >= 0 ? C.green : C.red }}>{sum5.netSavings >= 0 ? '+' : '−'}{peso(Math.abs(sum5.netSavings))}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>20th Period</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: sum20.netSavings >= 0 ? C.green : C.red }}>{sum20.netSavings >= 0 ? '+' : '−'}{peso(Math.abs(sum20.netSavings))}</div>
                </div>
              </div>
            </div>
          </Card>
        );
      }

      case 'period-burn': return (
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Payroll Period Burn — {MONTH_NAMES[CUR_MONTH]} {CUR_YEAR}</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 14 }}>
            {[['5th', sum5, period5], ['20th', sum20, period20]].map(([label, s, pd]) => {
              const income = s.totalIncome;
              const paid   = s.paidExpenses;
              const total  = s.totalExpenses;
              const pct    = income > 0 ? Math.min(100, (paid / income) * 100) : 0;
              const tc     = pct > 90 ? C.red : pct > 65 ? C.amber : C.green;
              const unpaidExpenses = pd.expenses.filter(e => !e.done && e.amount > 0);
              return (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{label} Payroll Period</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: tc }}>{pct.toFixed(0)}% used</span>
                  </div>
                  <div style={{ height: 8, background: C.border, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${C.green}, ${tc})`, borderRadius: 5, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                    {[['Income', peso(income), C.blue], ['Paid', peso(paid), tc], ['Budget', peso(total), C.muted]].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ fontSize: 11 }}>
                        <div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase', fontWeight: 700 }}>{lbl}</div>
                        <div style={{ color: col, fontWeight: 700, marginTop: 2 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {unpaidExpenses.length > 0 && (
                    <div style={{ fontSize: 10, color: C.muted, padding: '6px 8px', background: `${C.border}33`, borderRadius: 5 }}>
                      ⚠ {unpaidExpenses.length} unpaid: {unpaidExpenses.slice(0,3).map(e => e.name).join(', ')}{unpaidExpenses.length > 3 ? '...' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      );

      case 'expense-donut': return (
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Expense Breakdown — {MONTH_NAMES[CUR_MONTH]} {CUR_YEAR}</SecTitle>
          {expenseDonutData.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No expenses logged yet this month.</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <ResponsiveContainer width={130} height={130}>
                <PieChart>
                  <Pie data={expenseDonutData} dataKey="value" cx="50%" cy="50%" innerRadius={34} outerRadius={56}>
                    {expenseDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={ttip} formatter={v => peso(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, minWidth: 140 }}>
                {expenseDonutData.map(d => {
                  const tot = expenseDonutData.reduce((s, x) => s + x.value, 0);
                  const pct = tot > 0 ? ((d.value / tot) * 100).toFixed(0) : 0;
                  return (
                    <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ color: C.text, fontWeight: 600 }}>{d.name}</span>
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>{peso(d.value)} <span style={{ color: d.color, fontWeight: 700 }}>({pct}%)</span></span>
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: C.muted }}>Total Expenses</span>
                  <span style={{ color: C.red }}>{peso(expenseDonutData.reduce((s, d) => s + d.value, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      );

      case 'recent-tx': return (
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Recent Transactions</SecTitle>
          {allRecentTx.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No transactions logged yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {allRecentTx.map((tx, i) => (
                <div key={tx.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${C.border}18`, gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{tx.isCredit ? '💰' : (TX_SRC_ICON[tx.source] || '💸')}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: sm ? 130 : 200 }}>{tx.description}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{tx.date} · {tx.accountName}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: tx.isCredit ? C.green : C.red }}>
                      {tx.isCredit ? '+' : '−'}{peso(tx.amount)}
                    </span>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${tx.isCredit ? C.green : (TX_SRC_CLR[tx.source] || C.muted)}22`, color: tx.isCredit ? C.green : (TX_SRC_CLR[tx.source] || C.muted), fontWeight: 700, marginTop: 2 }}>
                      {tx.sourceLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      );

      case 'installment-summary': return (
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Installment Obligations</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: `${C.amber}11`, border: `1px solid ${C.amber}33` }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Monthly Obligation</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.amber }}>{peso(totalMonthlyObligation)}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Total across all active plans</div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: `${C.blue}11`, border: `1px solid ${C.blue}33` }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Active Plans</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.blue }}>{activeInstPlans.length}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{instPlans.length - activeInstPlans.length} completed</div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: `${C.purple}11`, border: `1px solid ${C.purple}33` }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Total Remaining</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.purple }}>
                {peso(activeInstPlans.reduce((s, pl) => {
                  const monthly = getInstBreakdownSimple(pl.total, pl.months, pl.interestRate, pl.customMonthly);
                  const remaining = Math.max(0, (Number(pl.months) || 12) - (pl.paidMonths || 0));
                  return s + monthly * remaining;
                }, 0))}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Outstanding balance</div>
            </div>
          </div>
          {activeInstPlans.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeInstPlans.slice(0, 5).map(pl => {
                const totalM = Number(pl.months) || 12;
                const paid   = pl.paidMonths || 0;
                const pct    = (paid / totalM) * 100;
                const monthly = getInstBreakdownSimple(pl.total, pl.months, pl.interestRate, pl.customMonthly);
                return (
                  <div key={pl.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{pl.item}</span>
                      <span style={{ color: C.muted }}>{peso(monthly)}/mo · {paid}/{totalM} paid</span>
                    </div>
                    <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${C.amber}, ${C.green})`, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeInstPlans.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No active installment plans. Go to Debts tab to add one.</div>
          )}
        </Card>
      );
      case 'metrics': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(6, minmax(0, 1fr))', gap: sm ? 8 : 12 }}>
          <MetricCard icon="^" label="Net Worth" value={confidentialValue(peso(netWorth))} sub={`${Math.round(avgRate)}% savings rate`} color={C.blue} sm={sm} masked={moneyMasked} onToggleMask={toggleMoneyMask} />
          <MetricCard icon="W" label="Total Assets" value={confidentialValue(peso(totalBal))} sub={`${accounts.length} accounts`} color={C.amber} sm={sm} masked={moneyMasked} onToggleMask={toggleMoneyMask} />
          <MetricCard icon="-" label="Total Liabilities" value={peso(totalDebts)} sub={`${debts.length} debts`} color={C.red} sm={sm} />
          <MetricCard icon="$" label="Cash & Equivalents" value={confidentialValue(peso(liquid))} sub={`${safetyMonths.toFixed(1)} months runway`} color={C.green} sm={sm} masked={moneyMasked} onToggleMask={toggleMoneyMask} />
          <MetricCard icon="P" label="Money Owed To You" value={peso(totalCredits)} sub={`${credits.filter(c => !c.done).length} outstanding`} color={C.purple} sm={sm} />
          <MetricCard icon="H" label="Financial Health" value={`${healthScore} / 100`} sub={grade.label} color={grade.color} sm={sm} />
        </div>
      );

      case 'balance-logs': return (
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Recent Balance Logs</SecTitle>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
            {['daily','monthly','yearly'].map(f => (
              <button key={f} onClick={() => setBalanceFilter(f)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${balanceFilter === f ? C.green : C.border}`, background: balanceFilter === f ? 'rgba(63,185,80,0.15)' : 'transparent', color: balanceFilter === f ? C.green : C.muted, cursor: 'pointer', fontSize: 11 }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={(() => {
              if (!balanceHistory || balanceHistory.length === 0) return [];
              const sorted = [...balanceHistory].sort((a, b) => a.date.localeCompare(b.date));
              if (balanceFilter === 'daily') return sorted.slice(-12).map(h => ({ label: h.date, total: Math.round(Object.values(h.balances).reduce((s, v) => s + v, 0) / 1000) }));
              if (balanceFilter === 'monthly') {
                const monthMap = {};
                sorted.forEach(entry => { const key = entry.date.slice(0, 7); monthMap[key] = (monthMap[key] || 0) + Object.values(entry.balances).reduce((s, v) => s + v, 0); });
                return Object.entries(monthMap).map(([k, total]) => ({ label: k, total: Math.round(total / 1000) })).slice(-12);
              }
              const yearMap = {};
              sorted.forEach(entry => { const key = entry.date.slice(0, 4); yearMap[key] = (yearMap[key] || 0) + Object.values(entry.balances).reduce((s, v) => s + v, 0); });
              return Object.entries(yearMap).map(([k, total]) => ({ label: k, total: Math.round(total / 1000) })).slice(-5);
            })()} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs><linearGradient id="bal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.3} /><stop offset="95%" stopColor={C.blue} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} tickFormatter={v => `${v}k`} />
              <Tooltip contentStyle={ttip} formatter={v => [`₱${v}k`, 'Total']} />
              <Area type="monotone" dataKey="total" stroke={C.blue} fill="url(#bal)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      );

      case 'cashflow': return (
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Cash Flow Distribution (₱k)</SecTitle>
          <ResponsiveContainer width="100%" height={ch}>
            <ComposedChart data={stats} margin={{ top: 5, right: 5, left: sm ? -20 : -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 11 }} tickFormatter={v => `${v}k`} />
              <Tooltip contentStyle={ttip} formatter={(v, n) => [`₱${v}k`, n]} />
              <Bar dataKey="fixed" name="Fixed Expenses" stackId="a" fill={C.red} />
              <Bar dataKey="variable" name="Variable Expenses" stackId="a" fill={C.orange} />
              <Bar dataKey="debt" name="Debt Payments" stackId="a" fill={C.amber} />
              <Bar dataKey="investment" name="Investments" stackId="a" fill={C.purple} />
              <Bar dataKey="chartSavings" name="Savings" stackId="a" fill={C.green} />
              <Line type="monotone" dataKey={d => Math.round(d.income / 1000)} name="Net Income" stroke={C.blue} strokeWidth={2} dot={{ fill: C.blue, r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <Legend items={[['Income', C.blue], ['Fixed', C.red], ['Variable', C.orange], ['Debt', C.amber], ['Investment', C.purple], ['Savings', C.green]]} />
        </Card>
      );

      case 'charts-row': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <SecTitle style={{ margin: 0 }}>Asset History (₱k)</SecTitle>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={historyView} onChange={e => setHistoryView(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, fontSize: 10, padding: '2px 4px', cursor: 'pointer', outline: 'none' }}>
                  <option value="total">Total</option>
                  <option value="category">Category</option>
                  <option value="account">Account</option>
                </select>
                <select value={historyGrouping} onChange={e => setHistoryGrouping(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, fontSize: 10, padding: '2px 4px', cursor: 'pointer', outline: 'none' }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={sch}>
              {historyView === 'total' ? (
                <AreaChart data={getGroupedHistoryData()} margin={{ top: 5, right: 5, left: sm ? -20 : -15, bottom: 0 }}>
                  <defs><linearGradient id="cnw3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.3} /><stop offset="95%" stopColor={C.green} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 11 }} tickFormatter={v => `${v}k`} />
                  <Tooltip contentStyle={ttip} formatter={v => [`₱${v}k`, 'Total Assets']} />
                  <Area type="monotone" dataKey="total" stroke={C.green} fill="url(#cnw3)" strokeWidth={2} dot={{ fill: C.green, r: 2 }} />
                </AreaChart>
              ) : (
                <LineChart data={getGroupedHistoryData()} margin={{ top: 5, right: 5, left: sm ? -20 : -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
                  <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 11 }} tickFormatter={v => `${v}k`} />
                  <Tooltip contentStyle={ttip} formatter={v => [`₱${v}k`]} />
                  {historyView === 'category' ? (
                    ['Investment', 'Savings', 'Checking', 'Digital'].map(cat => (
                      <Line key={cat} type="monotone" dataKey={cat} name={cat} stroke={TYPE_CLR[cat] || C.muted} strokeWidth={2} dot={{ r: 2 }} />
                    ))
                  ) : (
                    accounts.map((acc, index) => (
                      <Line key={acc.id} type="monotone" dataKey={acc.name} name={acc.name} stroke={getAccountColor(index)} strokeWidth={2} dot={{ r: 2 }} />
                    ))
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
            {historyView === 'category' && <Legend items={Object.entries(TYPE_CLR)} />}
            {historyView === 'account' && <Legend items={accounts.map((acc, index) => [acc.name, getAccountColor(index)])} />}
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Net Worth Forecast (₱k)</SecTitle>
            <ResponsiveContainer width="100%" height={sch}>
              <AreaChart data={forecast} margin={{ top: 5, right: 5, left: sm ? -20 : -15, bottom: 0 }}>
                <defs><linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.3} /><stop offset="95%" stopColor={C.blue} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
                <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 11 }} tickFormatter={v => `${v}k`} />
                <Tooltip contentStyle={ttip} formatter={v => [`₱${v}k`, 'Forecast']} />
                <Area type="monotone" dataKey="val" stroke={C.blue} fill="url(#cf)" strokeWidth={2} dot={{ fill: C.blue, r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Savings Rate %</SecTitle>
            <ResponsiveContainer width="100%" height={sch}>
              <BarChart data={stats} margin={{ top: 5, right: 5, left: sm ? -28 : -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
                <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={ttip} formatter={v => [`${Math.round(v)}%`, 'Rate']} />
                <ReferenceLine y={20} stroke={C.amber} strokeDasharray="4 2" />
                <Bar dataKey={d => Math.round(d.savingsRate)} fill={C.teal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      );

      case 'budget-row': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '3fr 2fr', gap: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Budget vs Actual</SecTitle>
            {bvsA.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, padding: 10 }}>No expense data for this range.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>
                      <th style={{ textAlign: 'left', padding: '6px 4px', color: C.muted }}>Expense Category</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: C.muted }}>Budget</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: C.muted }}>Actual</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', color: C.muted }}>Used %</th>
                      <th style={{ textAlign: 'center', padding: '6px 4px', color: C.muted }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bvsA.slice(0, 10).map((row, i) => {
                      const pct = row.budget > 0 ? (row.actual / row.budget) * 100 : 0;
                      const isOver = row.actual > row.budget;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}11` }}>
                          <td style={{ padding: '8px 4px', fontWeight: 600 }}>{row.name}</td>
                          <td style={{ padding: '8px 4px', textAlign: 'right' }}>{peso(row.budget)}</td>
                          <td style={{ padding: '8px 4px', textAlign: 'right', color: isOver ? C.red : C.text }}>{peso(row.actual)}</td>
                          <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: 10, color: isOver ? C.red : C.muted }}>{pct.toFixed(0)}%</span>
                              <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: isOver ? C.red : C.green }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                            {isOver ? <span style={{ color: C.red }}>⚠️</span> : <span style={{ color: C.green }}>✅</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card style={{ marginBottom: 0 }}>
              <SecTitle>Upcoming Obligations</SecTitle>
              {upcomingBills.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 12, padding: 4 }}>No bills due in this period.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingBills.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderBottom: `1px solid ${C.border}22`, paddingBottom: 4 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{b.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>Payroll Period: {b.period}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: C.red }}>{peso(b.amount)}</div>
                        <Tag color={b.daysLeft <= 3 ? C.red : C.amber}>{b.daysLeft === 0 ? 'Due Today' : `Due in ${b.daysLeft}d`}</Tag>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card style={{ marginBottom: 0 }}>
              <SecTitle>Goal Progress</SecTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {majorExpenses.slice(0, 4).map(e => {
                  const pct = e.budget > 0 ? (e.actual / e.budget) * 100 : 0;
                  return (
                    <div key={e.id} style={{ fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600 }}>{e.name}</span>
                        <span style={{ color: C.muted }}>{peso(e.actual)} / {peso(e.budget)}</span>
                      </div>
                      <div style={{ background: C.border, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: e.done ? C.green : C.blue, borderRadius: 4 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.muted, marginTop: 1 }}>
                        <span>{pct.toFixed(0)}% saved</span>
                        {e.date && <span>Target: {e.date}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      );

      case 'insights-row': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Smart Insights</SecTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, padding: '6px 8px', borderRadius: 6, background: ins.type === 'warn' ? `${C.red}11` : ins.type === 'good' ? `${C.green}11` : `${C.blue}11` }}>
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
      );

      case 'quick-actions': return (
        <Card style={{ marginBottom: 12, background: `linear-gradient(135deg, ${C.card}, #0f172a)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚡ Quick Actions & Module Shortcuts
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button onClick={() => setTab && setTab('transactions')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.purple}`, background: `${C.purple}22`, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                ➕ Add Transaction
              </button>
              <button onClick={() => setTab && setTab('reconcile')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.blue}`, background: `${C.blue}22`, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                🔍 Audit & Reconcile
              </button>
              <button onClick={() => setTab && setTab('graph')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.green}`, background: `${C.green}22`, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                📈 Financial Graph
              </button>
              <button onClick={() => setTab && setTab('debts')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.amber}`, background: `${C.amber}22`, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                💳 Debts & Payoffs
              </button>
              <button onClick={() => setTab && setTab('investments')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.teal}`, background: `${C.teal}22`, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                💼 Investments
              </button>
            </div>
          </div>
        </Card>
      );

      case 'account-health': return (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <SecTitle style={{ margin: 0 }}>🔍 Account Audit & Reconciliation Status</SecTitle>
            <button onClick={() => setTab && setTab('reconcile')} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              View All Accounts →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(4, 1fr)', gap: 10 }}>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.panel}66`, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>Total Accounts</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 2 }}>{accounts.length} Accounts</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.green}11`, border: `1px solid ${C.green}44` }}>
              <div style={{ fontSize: 10, color: C.green, textTransform: 'uppercase', fontWeight: 700 }}>Active Balances</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.green, marginTop: 2 }}>{peso(accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0))}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.amber}11`, border: `1px solid ${C.amber}44` }}>
              <div style={{ fontSize: 10, color: C.amber, textTransform: 'uppercase', fontWeight: 700 }}>Audit Status</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.amber, marginTop: 4 }}>Verified & Ready</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${C.purple}11`, border: `1px solid ${C.purple}44` }}>
              <div style={{ fontSize: 10, color: C.purple, textTransform: 'uppercase', fontWeight: 700 }}>Account Manager</div>
              <button onClick={() => setTab && setTab('account-manager')} style={{ border: 'none', background: 'none', color: C.purple, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: 4 }}>
                Manage Accounts ⚙️
              </button>
            </div>
          </div>
        </Card>
      );

      case 'debts-credits-summary': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <SecTitle style={{ margin: 0 }}>💳 Debt Obligations</SecTitle>
              <button onClick={() => setTab && setTab('debts')} style={{ background: 'none', border: 'none', color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Open Debts Tab →
              </button>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.red, marginBottom: 4 }}>
              {peso(debts.reduce((s, d) => s + (Number(d.balance) || 0), 0))}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Total remaining balance across {debts.length} active debt obligation(s).
            </div>
          </Card>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <SecTitle style={{ margin: 0 }}>💵 Money Owed to You (Credits)</SecTitle>
              <button onClick={() => setTab && setTab('credits')} style={{ background: 'none', border: 'none', color: C.green, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Open Credits Tab →
              </button>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.green, marginBottom: 4 }}>
              {peso((credits || []).reduce((s, c) => s + (Number(c.amount) || 0), 0))}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Total receivables owed to you across {(credits || []).length} borrower(s).
            </div>
          </Card>
        </div>
      );

      case 'net-worth-graph': return (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SecTitle style={{ margin: 0 }}>📈 Net Worth Trajectory (Financial Graph Preview)</SecTitle>
            <button onClick={() => setTab && setTab('graph')} style={{ background: 'none', border: 'none', color: C.green, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Open Interactive Graph →
            </button>
          </div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={getGroupedHistoryData()} margin={{ top: 5, right: 5, left: sm ? -20 : -15, bottom: 0 }}>
                <defs><linearGradient id="nwG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.35} /><stop offset="95%" stopColor={C.green} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
                <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 11 }} tickFormatter={v => `${v}k`} />
                <Tooltip contentStyle={ttip} formatter={v => [`₱${v}k`, 'Net Assets']} />
                <Area type="monotone" dataKey="total" stroke={C.green} fill="url(#nwG)" strokeWidth={2} dot={{ fill: C.green, r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      );

      case 'portfolio-summary': return (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SecTitle style={{ margin: 0 }}>💼 Investment Portfolio Summary</SecTitle>
            <button onClick={() => setTab && setTab('investments')} style={{ background: 'none', border: 'none', color: C.teal, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Open Investments Tab →
            </button>
          </div>
          {(() => {
            const invAccounts = accounts.filter(a => a.type === 'Investment');
            const totalInv = invAccounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.teal }}>{peso(totalInv)}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Allocated across {invAccounts.length} investment account(s)</div>
                </div>
                <button onClick={() => setTab && setTab('investments')} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.teal}`, background: `${C.teal}22`, color: C.teal, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  View Portfolio Assets
                </button>
              </div>
            );
          })()}
        </Card>
      );

      default: return null;
    }
  };

  const SECTION_LABELS = {
    'today-glance': 'Today at a Glance',
    'surplus-banner': 'Monthly Surplus / Deficit',
    'metrics': 'Key Metrics',
    'period-burn': 'Payroll Period Burn',
    'balance-logs': 'Balance Logs',
    'cashflow': 'Cash Flow',
    'expense-donut': 'Expense Breakdown Donut',
    'charts-row': 'Charts',
    'budget-row': 'Budget & Goals',
    'recent-tx': 'Recent Transactions',
    'installment-summary': 'Installment Obligations',
    'insights-row': 'Insights',
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:sm?'flex-start':'center',gap:14,marginBottom:16,flexDirection:sm?'column':'row'}}>
          {(() => {
            const greetingName = session?.user?.user_metadata?.first_name || (session?.user?.user_metadata?.full_name || session?.user?.email || 'User').split(' ')[0].split('@')[0];
            return <div style={{fontSize:sm?20:25,fontWeight:800,letterSpacing:0,color:C.text}}>Welcome back, {greetingName}!</div>;
          })()}
        <select
          value={range}
          onChange={e => setRange(e.target.value)}
          style={{background:C.panel,border:`1px solid ${C.border}`,color:C.text,borderRadius:7,padding:'9px 12px',fontSize:12,minWidth:sm?'100%':190,outline:'none'}}
        >
          <option value="current">Current month</option>
          <option value="12m">Last 12 months</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="custom">Custom range</option>
        </select>
      </div>
      {/* Period toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        {[
          ['current', '1M'],
          ['12m', '12M'],
          ['2025', '2025'],
          ['2024', '2024'],
          ['custom', 'Custom']
        ].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} style={{ padding: '6px 11px', borderRadius: 6, border: `1px solid ${range === v ? C.purple : C.border}`, background: range === v ? `${C.purple}33` : C.panel, color: range === v ? C.text : C.muted, cursor: 'pointer', fontSize: 11, fontWeight:700 }}>
            {l}
          </button>
        ))}
        {range === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
            <input type="date" value={customStart} onChange={e => handleCustomStartChange(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <span style={{ color: C.muted, fontSize: 12 }}>to</span>
            <input type="date" value={customEnd} onChange={e => handleCustomEndChange(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        )}
        {/* Customize Layout & Reset buttons */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCustomizeModal(true)}
            title="Customize dashboard widgets and layout"
            style={{ padding: '6px 11px', borderRadius: 6, border: `1px solid ${C.purple}`, background: `${C.purple}22`, color: C.text, cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            ⚙️ Customize Widgets
          </button>
          <button
            onClick={resetCardOrder}
            title="Reset dashboard layout to default"
            style={{ padding: '6px 11px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            ↺ Reset Layout
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
        Viewing: {range === 'custom' ? `${customStart} to ${customEnd}` : (keys.length > 0 ? `${displayKey(keys[0])} – ${displayKey(keys[keys.length - 1])}` : '')}
      </div>

      {/* ── Draggable sections ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {cardOrder.map(id => {
          if (hiddenCards.includes(id)) return null;
          const isHalf     = cardSizes[id] === 'half';
          const isCollapsed = !!cardCollapsed[id];
          return (
            <div
              key={id}
              draggable
              onDragStart={() => handleDragStart(id)}
              onDragEnter={() => handleDragEnter(id)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{
                gridColumn: sm ? '1' : (isHalf ? 'span 1' : 'span 2'),
                position: 'relative',
                opacity: dragActive === id ? 0.45 : 1,
                outline: dropTarget === id && dragActive !== id ? `2px dashed ${C.green}` : '2px solid transparent',
                outlineOffset: 3,
                borderRadius: 10,
                transition: 'opacity 0.18s, outline 0.15s',
              }}
            >
              {/* Control bar: drag handle + width toggle + collapse */}
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 10,
                  display: 'flex',
                  gap: 3,
                  alignItems: 'center',
                  opacity: 0.35,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.35'; }}
              >
                {/* Width toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggleSize(id); }}
                  title={isHalf ? 'Expand to full width' : 'Shrink to half width'}
                  style={{
                    background: `${C.card}ee`,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    color: C.muted,
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '2px 5px',
                    lineHeight: 1.2,
                  }}
                >
                  {isHalf ? '⬜⬜' : '⬛'}
                </button>
                {/* Collapse toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggleCollapse(id); }}
                  title={isCollapsed ? 'Expand section' : 'Collapse section'}
                  style={{
                    background: `${C.card}ee`,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    color: C.muted,
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '2px 5px',
                    lineHeight: 1.2,
                  }}
                >
                  {isCollapsed ? '▲' : '▼'}
                </button>
                {/* Drag handle */}
                <span
                  title={`Drag to rearrange`}
                  style={{
                    background: `${C.card}ee`,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    color: C.muted,
                    cursor: 'grab',
                    fontSize: 14,
                    padding: '2px 5px',
                    lineHeight: 1.2,
                    userSelect: 'none',
                  }}
                >
                  ⠿
                </span>
              </div>

              {/* Collapsed state: compact title bar */}
              {isCollapsed ? (
                <div
                  onClick={() => toggleCollapse(id)}
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: '10px 44px 10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.text,
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 4px' }}>▲ show</span>
                  {SECTION_LABELS[id]}
                </div>
              ) : sectionContent(id)}
            </div>
          );
        })}
      </div>

      {showCustomizeModal && (
        <CustomizeDashboardModal 
          cardOrder={cardOrder} 
          setCardOrder={setCardOrder} 
          hiddenCards={hiddenCards} 
          toggleCardVisibility={toggleCardVisibility} 
          resetCardOrder={resetCardOrder} 
          onClose={() => setShowCustomizeModal(false)} 
        />
      )}
    </div>
  );
}

// ─── CUSTOMIZE DASHBOARD MODAL ───────────────────────────────────────────────
function CustomizeDashboardModal({ cardOrder, setCardOrder, hiddenCards, toggleCardVisibility, resetCardOrder, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 16
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '24px 28px', maxWidth: 520, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>⚙️ Customize Dashboard Widgets</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          Toggle widget visibility on your financial dashboard or reset to default layout.
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {cardOrder.map((id) => {
            const label = CARD_LABELS[id] || id;
            const isHidden = hiddenCards.includes(id);

            return (
              <div 
                key={id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8, background: `${C.panel}88`,
                  border: `1px solid ${C.border}`, opacity: isHidden ? 0.5 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: C.text }}>
                  <span>{label}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => toggleCardVisibility(id)}
                    style={{
                      padding: '4px 10px', borderRadius: 6,
                      border: `1px solid ${isHidden ? C.muted : C.green}`,
                      background: isHidden ? 'transparent' : `${C.green}22`,
                      color: isHidden ? C.muted : C.green,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {isHidden ? '👁️ Hidden' : '✅ Visible'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <button 
            onClick={() => { resetCardOrder(); localStorage.removeItem('dashboardHiddenCards'); window.location.reload(); }}
            style={{ border: 'none', background: 'none', color: C.amber, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            ↺ Reset Layout to Default
          </button>
          <BtnG onClick={onClose}>Done</BtnG>
        </div>
      </div>
    </div>
  );
}



// ─── HISTORY ─────────────────────────────────────────────────────────────────
function PeriodDetail({data,summary}) {
  return(
    <div style={{background:'#0d1117',borderRadius:8,padding:'10px 12px'}}>
      {[['Salary',peso(data.salary),C.text],['Wkday OT',data.ot.weekday>0?`${data.ot.weekday}h → ${peso(summary.otCalc.weekdayEarned)}`:'—',C.muted],['Wknd OT',data.ot.weekend>0?`${data.ot.weekend}h → ${peso(summary.otCalc.weekendEarned)}`:'—',C.muted],['Net OT',peso(summary.otCalc.net),C.purple],['Income',peso(summary.totalIncome),C.blue],['Expenses',peso(summary.totalExpenses),C.red],['Saved',peso(summary.netSavings),summary.netSavings>=0?C.green:C.red]].map(([l,v,c])=>(
      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:`1px solid ${C.border}22`,fontSize:12}}>
        <span style={{color:C.muted}}>{l}</span><span style={{color:c,fontWeight:['Income','Saved'].includes(l)?700:400}}>{v}</span>
      </div>))}
    </div>
  );
}

function HistoryTab({budgetData,sm}) {
  const [expanded,setExpanded]=useState(null);
  const [filterYear,setFilterYear]=useState('all');

  const allRows=Object.keys(budgetData).filter(k=>/^\d{4}-\d{2}$/.test(k)).map(key=>{
    const mt=calcMonth(budgetData[key]);
    return{key,label:displayKey(key),year:parseKey(key).year,...mt};
  }).sort((a,b)=>b.key.localeCompare(a.key));

  const years=['all',...[...new Set(allRows.map(r=>r.year))].sort((a,b)=>b-a)];
  const filtered=filterYear==='all'?allRows:allRows.filter(r=>r.year===filterYear);
  const totI=filtered.reduce((s,r)=>s+r.income,0);
  const totE=filtered.reduce((s,r)=>s+r.expenses,0);
  const totS=filtered.reduce((s,r)=>s+r.savings,0);
  const totOT=filtered.reduce((s,r)=>s+r.otIncome,0);
  const byYear=filtered.reduce((g,r)=>{(g[r.year]=g[r.year]||[]).push(r);return g;},{});
  const rc=r=>r.savingsRate>=25?C.green:r.savingsRate>=10?C.amber:C.red;

  return(
    <div>
      <div style={{display:'grid',gridTemplateColumns:sm?'1fr 1fr':'repeat(4,1fr)',gap:sm?8:12,marginBottom:14}}>
        <MetricCard label="Income" value={fmtK(totI)} color={C.blue} sm={sm}/>
        <MetricCard label="Expenses" value={fmtK(totE)} color={C.red} sm={sm}/>
        <MetricCard label="Savings" value={fmtK(totS)} color={totS>=0?C.green:C.red} sm={sm}/>
        <MetricCard label="OT Income" value={fmtK(totOT)} color={C.purple} sm={sm}/>
      </div>

      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>
        <span style={{fontSize:12,color:C.muted}}>Year:</span>
        {years.map(y=>(
          <button key={y} onClick={()=>setFilterYear(y)} style={{padding:'5px 12px',borderRadius:14,border:`1px solid ${filterYear===y?C.green:C.border}`,background:filterYear===y?'rgba(63,185,80,0.15)':'transparent',color:filterYear===y?C.green:C.muted,cursor:'pointer',fontSize:12,fontWeight:filterYear===y?600:400}}>
            {y==='all'?'All Years':y}
          </button>
        ))}
      </div>

      {allRows.length===0&&<Card><div style={{color:C.muted,textAlign:'center',padding:'24px 0',fontSize:14}}>No entries yet. Add data in the Monthly Budget tab.</div></Card>}

      {Object.entries(byYear).sort((a,b)=>b[0]-a[0]).map(([year,rows])=>(
        <div key={year} style={{marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:C.green,display:'inline-block'}}/>
            <span style={{fontSize:14,fontWeight:700,color:C.muted}}>{year}</span>
            <span style={{flex:1,height:1,background:C.border}}/>
            <span style={{fontSize:12,color:C.muted}}>
              {fmtK(rows.reduce((s,r)=>s+r.income,0))} in · {fmtK(rows.reduce((s,r)=>s+r.expenses,0))} out · <span style={{color:C.green,fontWeight:600}}>{fmtK(rows.reduce((s,r)=>s+r.savings,0))} saved</span>
            </span>
          </div>

          {sm?(
            rows.map(r=>{
              const isE=expanded===r.key;
              return(
                <div key={r.key} style={{background:C.card,borderRadius:10,border:`1px solid ${isE?C.green+'55':C.border}`,marginBottom:10,overflow:'hidden'}}>
                  <div onClick={()=>setExpanded(isE?null:r.key)} style={{padding:'14px 16px',cursor:'pointer'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <span style={{fontWeight:700,fontSize:15}}>{r.label}</span>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}><Tag color={rc(r)}>{Math.round(r.savingsRate)}%</Tag><span style={{color:C.muted}}>{isE?'▲':'▼'}</span></div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                      {[['Income',fmtK(r.income),C.blue],['Expenses',fmtK(r.expenses),C.red],['Saved',fmtK(r.savings),r.savings>=0?C.green:C.red]].map(([l,v,c])=>(
                        <div key={l}><div style={{fontSize:10,color:C.muted,marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:c}}>{v}</div></div>
                      ))}
                    </div>
                    {r.otHours>0&&<div style={{marginTop:8,fontSize:11,color:C.purple}}>⏱ {r.otHours} OT hrs · {fmtK(r.otIncome)}</div>}
                  </div>
                  {isE&&(
                    <div style={{padding:'0 16px 16px',borderTop:`1px solid ${C.border}`}}>
                      <div style={{paddingTop:12,marginBottom:10}}><div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',marginBottom:6}}>5th Period</div><PeriodDetail data={budgetData[r.key]['5th']} summary={r.s5}/></div>
                      <div><div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',marginBottom:6}}>20th Period</div><PeriodDetail data={budgetData[r.key]['20th']} summary={r.s20}/></div>
                    </div>
                  )}
                </div>
              );
            })
          ):(
            <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,overflow:'hidden',marginBottom:6}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#0d1117',borderBottom:`1px solid ${C.border}`}}>
                    {['Month','Income','OT Income','OT Hrs','Expenses','Net Savings','Rate',''].map((l,i)=>(
                      <th key={i} style={{padding:'9px 12px',textAlign:i===0?'left':'right',color:C.muted,fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r=>{
                    const isE=expanded===r.key;
                    return[
                      <tr key={r.key} onClick={()=>setExpanded(isE?null:r.key)} style={{borderBottom:`1px solid ${C.border}22`,cursor:'pointer',background:isE?`${C.green}0a`:'transparent'}}>
                        <td style={{padding:'11px 12px',fontWeight:600,fontSize:14}}>{r.label}</td>
                        <td style={{padding:'11px 12px',textAlign:'right',color:C.blue,fontSize:13}}>{fmtK(r.income)}</td>
                        <td style={{padding:'11px 12px',textAlign:'right',color:r.otIncome>0?C.purple:C.muted,fontSize:13}}>{r.otIncome>0?fmtK(r.otIncome):'—'}</td>
                        <td style={{padding:'11px 12px',textAlign:'right',color:r.otHours>0?C.teal:C.muted,fontSize:13}}>{r.otHours>0?r.otHours+' hrs':'—'}</td>
                        <td style={{padding:'11px 12px',textAlign:'right',color:C.red,fontSize:13}}>{fmtK(r.expenses)}</td>
                        <td style={{padding:'11px 12px',textAlign:'right',fontWeight:700,color:r.savings>=0?C.green:C.red,fontSize:13}}>{fmtK(r.savings)}</td>
                        <td style={{padding:'11px 12px',textAlign:'right'}}><Tag color={rc(r)}>{Math.round(r.savingsRate)}%</Tag></td>
                        <td style={{padding:'11px 8px',color:C.muted,textAlign:'center'}}>{isE?'▲':'▼'}</td>
                      </tr>,
                      isE&&(
                        <tr key={r.key+'-d'} style={{background:'#0d1117'}}>
                          <td colSpan={8} style={{padding:'0 16px 16px'}}>
                            <div style={{paddingTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                              <div><SecTitle>5th Period</SecTitle><PeriodDetail data={budgetData[r.key]['5th']} summary={r.s5}/></div>
                              <div><SecTitle>20th Period</SecTitle><PeriodDetail data={budgetData[r.key]['20th']} summary={r.s20}/></div>
                            </div>
                          </td>
                        </tr>
                      )
                    ];
                  })}
                  <tr style={{background:'#0d1117',borderTop:`1px solid ${C.border}`}}>
                    <td style={{padding:'9px 12px',fontWeight:700,color:C.muted,fontSize:12}}>Subtotal {year}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',color:C.blue,fontWeight:700,fontSize:12}}>{fmtK(rows.reduce((s,r)=>s+r.income,0))}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',color:C.purple,fontWeight:700,fontSize:12}}>{fmtK(rows.reduce((s,r)=>s+r.otIncome,0))}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',color:C.muted,fontSize:12}}>{rows.reduce((s,r)=>s+r.otHours,0)} hrs</td>
                    <td style={{padding:'9px 12px',textAlign:'right',color:C.red,fontWeight:700,fontSize:12}}>{fmtK(rows.reduce((s,r)=>s+r.expenses,0))}</td>
                    <td style={{padding:'9px 12px',textAlign:'right',color:C.green,fontWeight:700,fontSize:12}}>{fmtK(rows.reduce((s,r)=>s+r.savings,0))}</td>
                    <td colSpan={2}/>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {filtered.length>0&&(
        <div style={{background:'#0d1117',borderRadius:10,border:`1px solid ${C.border}`,padding:'12px 16px',display:'grid',gridTemplateColumns:sm?'1fr 1fr':'repeat(4,1fr)',gap:12}}>
          {[['Total Income',fmtK(totI),C.blue],['Total Expenses',fmtK(totE),C.red],['Total Savings',fmtK(totS),totS>=0?C.green:C.red],['OT Income',fmtK(totOT),C.purple]].map(([l,v,c])=>(
            <div key={l}><div style={{fontSize:11,color:C.muted,marginBottom:3}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:c}}>{v}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BUDGET ───────────────────────────────────────────────────────────────────
function BudgetTab({budgetData,setBudgetData,sm,readOnly,canWrite,canUpdate}) {
  const [selYear,setSelYear]=useState(CUR_YEAR);
  const [selMI,setSelMI]=useState(CUR_MONTH);
  const [period,setPeriod]=useState('5th');
  const key=makeKey(selYear,selMI);
  const md=getOrMake(budgetData,key);
  const pData=md[period];
  const summ=calcSummary(pData);
  const otCalc=summ.otCalc;
  const paid=pData.expenses.filter(e=>e.done).length;
  const hasData=!!budgetData[key];

  function upd(changes) {
    if (readOnly) return;
    setBudgetData(prev=>({...prev,[key]:{...(prev[key]||makeMonthData()),[period]:{...(prev[key]?.[period]||makePeriod()),...changes}}}));
  }
  function updOT(f,v){
    if (readOnly) return;
    upd({ot:{...pData.ot,[f]:Number(v)||0}});
  }
  function updExp(i,f,v){
    if (readOnly) return;
    const exp=[...pData.expenses];
    exp[i]={...exp[i],[f]:(f==='amount'||f==='budget')?(Number(v)||0):v};
    upd({expenses:exp});
  }

  return(
    <div>
      <YMPicker year={selYear} monthIdx={selMI} onYear={setSelYear} onMonth={setSelMI} sm={sm}/>
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        {['5th','20th'].map(p=>(
          <button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:'10px',borderRadius:8,border:`1px solid ${period===p?C.green:C.border}`,background:period===p?'rgba(63,185,80,0.2)':'transparent',color:period===p?C.green:C.muted,cursor:'pointer',fontSize:14,fontWeight:period===p?700:400}}>
            Payroll {p}
          </button>
        ))}
      </div>
      {!hasData&&<div style={{background:`${C.amber}11`,border:`1px solid ${C.amber}44`,borderRadius:10,padding:'12px 16px',marginBottom:14,fontSize:13,color:C.amber}}>📝 No data for {MONTH_NAMES[selMI]} {selYear} — template loaded. Edit to save.</div>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
        <MetricCard label="Total Income" value={peso(summ.totalIncome)} color={C.blue} sm={sm}/>
        <MetricCard label="OT (Net)" value={peso(otCalc.net)} color={C.purple} sm={sm}/>
        <MetricCard label="Expenses" value={peso(summ.totalExpenses)} color={C.red} sm={sm}/>
        <MetricCard label="Net Savings" value={peso(summ.netSavings)} color={summ.netSavings>=0?C.green:C.red} sm={sm}/>
      </div>

      <Card>
        <SecTitle>Income</SecTitle>
        <div style={{marginBottom:12}}><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Base Salary</div><Inp type="number" value={pData.salary} onChange={e=>upd({salary:Number(e.target.value)||0})} disabled={readOnly}/></div>
        <Divider/>
        <SecTitle>Overtime Hours</SecTitle>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Weekday (₱750/hr)</div><Inp type="number" value={pData.ot.weekday} onChange={e=>updOT('weekday',e.target.value)} disabled={readOnly}/></div>
          <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Weekend (₱680/hr)</div><Inp type="number" value={pData.ot.weekend} onChange={e=>updOT('weekend',e.target.value)} disabled={readOnly}/></div>
        </div>
        {otCalc.gross>0&&(<>
          <Divider/>
          <SecTitle>Overtime Breakdown</SecTitle>
          {[['Weekday',peso(otCalc.weekdayEarned),C.text],['Weekend',peso(otCalc.weekendEarned),C.text],['Gross OT',peso(otCalc.gross),C.blue],['Tax 20%',`(${peso(otCalc.tax)})`,C.red],['Net OT',peso(otCalc.net),C.green]].map(([l,v,c])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.border}22`,fontSize:13}}>
              <span style={{color:C.muted}}>{l}</span><span style={{color:c,fontWeight:['Net OT','Gross OT'].includes(l)?600:400}}>{v}</span>
            </div>
          ))}
        </>)}
        <Divider/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:700}}>
          <span style={{color:C.muted}}>Net Savings</span>
          <span style={{color:summ.netSavings>=0?C.green:C.red}}>{peso(summ.netSavings)}</span>
        </div>
      </Card>

      <Card>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <SecTitle>Expenses — {paid}/{pData.expenses.length} paid</SecTitle>
          {canWrite && (
            <BtnG style={{padding:'6px 12px',fontSize:12}} onClick={()=>upd({expenses:[...pData.expenses,{name:'',budget:0,amount:0,done:false}]})}>+ Add</BtnG>
          )}
        </div>
        {pData.expenses.map((exp,i)=>(
          <div key={i} style={{padding:'8px 0',borderBottom:`1px solid ${C.border}22`}}>
            <div style={{display:'flex',gap:8,marginBottom:sm?6:0}}>
              <Inp value={exp.name} onChange={e=>updExp(i,'name',e.target.value)} placeholder="Item name" style={{flex:1,opacity:exp.done?0.5:1}} disabled={readOnly}/>
              {!sm&&<div style={{display:'flex',gap:4}}>
                <Inp type="number" value={exp.budget ?? exp.amount ?? ''} onChange={e=>updExp(i,'budget',e.target.value)} placeholder="Budget" style={{width:90,textAlign:'right',opacity:exp.done?0.5:1}} disabled={readOnly}/>
                <Inp type="number" value={exp.amount ?? ''} onChange={e=>updExp(i,'amount',e.target.value)} placeholder="Actual" style={{width:90,textAlign:'right',opacity:exp.done?0.5:1}} disabled={readOnly}/>
              </div>}
              {canUpdate && (
                <button onClick={() => updExp(i, 'done', !exp.done)} style={{ minWidth: 40, background: 'none', border: `1px solid ${exp.done ? C.green : C.border}`, borderRadius: 6, cursor: 'pointer', color: exp.done ? C.green : C.muted, fontSize: 14, padding: '0 8px' }}>
                  {exp.done ? '✓' : '—'}
                </button>
              )}
              {canUpdate && (
                <button onClick={() => upd({ expenses: pData.expenses.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
              )}
            </div>
            {sm && <div style={{display:'flex',gap:4,marginTop:4}}>
              <Inp type="number" value={exp.budget ?? exp.amount ?? ''} onChange={e => updExp(i, 'budget', e.target.value)} placeholder="Budget (₱)" style={{ opacity: exp.done ? 0.5 : 1 }} disabled={readOnly}/>
              <Inp type="number" value={exp.amount ?? ''} onChange={e => updExp(i, 'amount', e.target.value)} placeholder="Actual (₱)" style={{ opacity: exp.done ? 0.5 : 1 }} disabled={readOnly}/>
            </div>}
          </div>
        ))}
        <Divider />
        {[['Paid', peso(summ.paidExpenses), C.green], ['Remaining', peso(summ.totalExpenses - summ.paidExpenses), C.amber]].map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: C.muted }}>{l}</span><span style={{ color: c }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 4 }}><span style={{ color: C.muted }}>Total</span><span style={{ color: C.red }}>{peso(summ.totalExpenses)}</span></div>
      </Card>
    </div>
  );
}

// ─── ACCOUNTS (Clean Read-Only View) ─────────────────────────────────────────
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
              style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.amber}55`, background: `${C.amber}18`, color: C.amber, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              🗂️ Manage Accounts →
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Banner ── */}
      <div style={{ background: `linear-gradient(135deg, ${C.purple}22, ${C.green}18)`, borderRadius: 14, border: `1px solid ${C.border}`, padding: '18px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
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
            <Card key={type} style={{ marginBottom: 0, border: `1px solid ${color}33` }}>
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
              <div style={{ height: 4, borderRadius: 2, background: `${C.border}44`, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${total > 0 ? (catTotal / total * 100) : 0}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>

              {accs.map(acc => (
                <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.border}22` }}>
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
        <MetricCard icon="🏦" label="Total Accounts"   value={accounts.length.toString()}        color={C.blue}   sm={sm} sub={`${cats.length} categories`} />
        <MetricCard icon="📈" label="Highest Balance"  value={highest ? peso(highest.balance) : '—'} color={C.purple} sm={sm} sub={highest?.name || '—'} />
        <MetricCard icon="📉" label="Lowest Balance"   value={lowest ? peso(lowest.balance) : '—'}  color={C.red}    sm={sm} sub={lowest?.name || '—'} />
      </div>

      {/* ── Add New Account Panel ── */}
      {canWrite && (
        <Card style={{ marginBottom: 16, border: `1px solid ${C.amber}33` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAdd ? 14 : 0 }}>
            <SecTitle style={{ margin: 0 }}>➕ Add New Account</SecTitle>
            <button onClick={() => setShowAdd(p => !p)}
              style={{ background: showAdd ? `${C.amber}22` : 'none', border: `1px solid ${C.amber}55`, borderRadius: 6, color: C.amber, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
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
                  style={{ padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', width: '100%' }}>
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
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterType === t ? (typeColors[t] || C.blue) : C.border}`, background: filterType === t ? `${typeColors[t] || C.blue}22` : 'transparent', color: filterType === t ? (typeColors[t] || C.blue) : C.muted }}>
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
              <tr style={{ background: `${C.card2}`, borderBottom: `1px solid ${C.border}` }}>
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
                  <tr key={acc.id} style={{ borderBottom: `1px solid ${C.border}22`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = `${C.card2}88`}
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
                          style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}>
                          {['Investment','Savings','Checking','Digital','Cash'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `${color}22`, color }}>{acc.type}</span>
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
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: `${C.border}44`, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
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
                              style={{ background: `${C.blue}18`, border: `1px solid ${C.blue}44`, borderRadius: 5, color: C.blue, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Edit</button>
                            <button onClick={() => deleteAcc(acc.id)}
                              style={{ background: `${C.red}18`, border: `1px solid ${C.red}44`, borderRadius: 5, color: C.red, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑 Delete</button>
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
  const [txType, setTxType] = useState('debit'); // 'debit' or 'credit'
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [editingLedgerTx, setEditingLedgerTx] = useState(null);

  const handleDebitDateChange = (val) => {
    setDebitDate(val);
    const day = Number(val.split('-')[2]) || 1;
    setDebitPeriod(day <= 15 ? '5th' : '20th');
  };

  const handleStartEditLedgerTx = (tx) => {
    setSelectedAccId(tx.accountId || accounts[0]?.id || '');
    setDebitAmount(String(tx.amount || ''));
    setDebitDesc(tx.description || '');
    setDebitDate(tx.date || new Date().toISOString().slice(0, 10));
    setDebitPeriod(tx.period || (new Date().getDate() <= 15 ? '5th' : '20th'));
    setTxType(tx.isCredit ? 'credit' : 'debit');
    setExcludeFromBudget(!!tx.excludeFromBudget);
    setEditingLedgerTx(tx);
    setShowForm(true);
  };

  const handleCancelEditLedgerTx = () => {
    setEditingLedgerTx(null);
    setDebitAmount('');
    setDebitDesc('');
    setTxType('debit');
    setExcludeFromBudget(false);
  };

  // ── Unified outflow sources ──
  const manualDebits   = (budgetData.debitHistory       || []).map(d => ({ 
    ...d, 
    source: 'manual',      
    sourceLabel: d.isCredit ? 'Manual Credit' : 'Manual Debit' 
  }));
  const ccCharges      = (budgetData.ccHistory          || []).map(d => ({ ...d, source: 'cc',          sourceLabel: 'CC Charge'    }));
  const installments   = (budgetData.installmentHistory || []).map(d => ({ ...d, source: 'installment', sourceLabel: 'Installment'  }));
  const allTx = [...manualDebits, ...ccCharges, ...installments]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // ── Metrics (Only for spending outflows) ──
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const last7Date    = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  const outflows     = allTx.filter(t => !t.isCredit);
  const thisMonthAmt = outflows.filter(t => (t.date || '').slice(0, 7) === thisMonthKey).reduce((s, t) => s + (t.amount || 0), 0);
  const last7Amt     = outflows.filter(t => (t.date || '') >= last7Date).reduce((s, t) => s + (t.amount || 0), 0);
  const biggestTx    = outflows.reduce((mx, t) => (t.amount || 0) > (mx?.amount || 0) ? t : mx, null);

  // ── Filtered ──
  const filtered = allTx.filter(t => {
    if (filterSource !== 'all' && t.source !== filterSource) return false;
    if (filterSearch && !`${t.description || ''}${t.accountName || ''}`.toLowerCase().includes(filterSearch.toLowerCase())) return false;
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
    const isCredit = txType === 'credit';

    // If editing an existing ledger transaction, first revert its original balance and budget expense
    if (editingLedgerTx) {
      if (editingLedgerTx.accountId && editingLedgerTx.accountId !== 'none') {
        setAccounts(prev => prev.map(a => a.id === editingLedgerTx.accountId ? { ...a, balance: editingLedgerTx.isCredit ? a.balance - editingLedgerTx.amount : a.balance + editingLedgerTx.amount } : a));
      }
      const oldKey = (editingLedgerTx.date || '').slice(0, 7);
      const oldExpName = editingLedgerTx.source === 'installment'
        ? `Installment: ${editingLedgerTx.description.replace('Installment Payment: ', '')}`
        : (editingLedgerTx.source === 'cc' ? `${editingLedgerTx.description} (CC)` : `${editingLedgerTx.description} (${editingLedgerTx.accountName})`);

      setBudgetData(prev => {
        const md = prev[oldKey] || makeMonthData();
        const pd = md[editingLedgerTx.period] || makePeriod();
        const updatedBudgetData = { ...prev };

        if (editingLedgerTx.source === 'installment') {
          updatedBudgetData.installmentHistory = (prev.installmentHistory || []).filter(h => h.id !== editingLedgerTx.id);
        } else if (editingLedgerTx.source === 'cc') {
          updatedBudgetData.ccHistory = (prev.ccHistory || []).filter(h => h.id !== editingLedgerTx.id);
        } else {
          updatedBudgetData.debitHistory = (prev.debitHistory || []).filter(h => h.id !== editingLedgerTx.id);
        }

        if (!editingLedgerTx.isCredit && !editingLedgerTx.excludeFromBudget) {
          updatedBudgetData[oldKey] = {
            ...md,
            [editingLedgerTx.period]: {
              ...pd,
              expenses: pd.expenses.filter(e => !(e.name === oldExpName && e.amount === editingLedgerTx.amount))
            }
          };
        }
        return updatedBudgetData;
      });
    }

    // Update account balance for new values
    setAccounts(prev => prev.map(a => a.id === accId ? { ...a, balance: isCredit ? a.balance + amount : a.balance - amount } : a));

    setBudgetData(prev => {
      const newItem = {
        id: editingLedgerTx ? editingLedgerTx.id : ('deb-' + Date.now()),
        accountId: accId,
        accountName: account.name,
        amount,
        description: debitDesc.trim(),
        date: dateStr,
        period,
        isCredit,
        excludeFromBudget: isCredit ? true : excludeFromBudget,
        timestamp: new Date().toISOString()
      };

      if (!isCredit && !excludeFromBudget) {
        // Budgeted debit: add as expense line item
        const monthData  = prev[key]         || makeMonthData();
        const periodData = monthData[period]  || makePeriod();
        const newExpense = { name: `${debitDesc.trim()} (${account.name})`, budget: amount, amount, done: true };
        return {
          ...prev,
          [key]: { ...monthData, [period]: { ...periodData, expenses: [...periodData.expenses, newExpense] } },
          debitHistory: [newItem, ...(prev.debitHistory || []).filter(h => h.id !== newItem.id)]
        };
      } else {
        // Credit or unbudgeted debit
        return {
          ...prev,
          debitHistory: [newItem, ...(prev.debitHistory || []).filter(h => h.id !== newItem.id)]
        };
      }
    });

    setDebitAmount('');
    setDebitDesc('');
    const wasEditing = editingLedgerTx;
    setEditingLedgerTx(null);
    setDebitSuccessMsg(wasEditing ? 'Transaction updated!' : (isCredit ? 'Credit logged!' : 'Debit logged!'));
    setTimeout(() => setDebitSuccessMsg(''), 3000);
  };

  const handleDeleteTx = (tx) => {
    const msg = tx.isCredit
      ? `Remove this credit entry and deduct ₱${(tx.amount || 0).toLocaleString()} from ${tx.accountName}?`
      : `Refund ₱${(tx.amount || 0).toLocaleString()} back to ${tx.accountName || 'account'} and remove this entry?`;
    if (!confirm(msg)) return;

    // Reverse balance adjustment
    if (tx.accountId && tx.accountId !== 'none') {
      setAccounts(prev => prev.map(a => a.id === tx.accountId ? { ...a, balance: tx.isCredit ? a.balance - tx.amount : a.balance + tx.amount } : a));
    }

    const key = (tx.date || '').slice(0, 7);
    const expName = tx.source === 'installment'
      ? `Installment: ${tx.description.replace('Installment Payment: ', '')}`
      : (tx.source === 'cc' ? `${tx.description} (CC)` : `${tx.description} (${tx.accountName})`);

    setBudgetData(prev => {
      const md = prev[key] || makeMonthData();
      const pd = md[tx.period] || makePeriod();

      const newBudgetData = {
        ...prev
      };

      if (tx.source === 'installment') {
        newBudgetData.installmentHistory = (prev.installmentHistory || []).filter(h => h.id !== tx.id);
        if (tx.planId) {
          try {
            const saved = JSON.parse(localStorage.getItem('bg_installments') || '[]');
            const updated = saved.map(p => p.id === tx.planId ? { ...p, paidMonths: Math.max(0, p.paidMonths - 1) } : p);
            localStorage.setItem('bg_installments', JSON.stringify(updated));
          } catch (e) {
            console.error("Failed to decrement paidMonths in localStorage:", e);
          }
        }
      } else if (tx.source === 'cc') {
        newBudgetData.ccHistory = (prev.ccHistory || []).filter(h => h.id !== tx.id);
      } else {
        newBudgetData.debitHistory = (prev.debitHistory || []).filter(h => h.id !== tx.id);
      }

      // Only clean up budget expenses if it was a budgeted manual debit, cc, or installment
      if (!tx.isCredit && !tx.excludeFromBudget) {
        newBudgetData[key] = {
          ...md,
          [tx.period]: {
            ...pd,
            expenses: pd.expenses.filter(e => !(e.name === expName && e.amount === tx.amount))
          }
        };
      }

      return newBudgetData;
    });
  };

  const SRC_CLR  = { manual: C.blue, cc: C.purple, installment: C.amber };
  const SRC_PILL = { manual: '💸', cc: '💳', installment: '📦' };

  return (
    <div>
      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <MetricCard icon="💸" label="This Month Total"     value={peso(thisMonthAmt)}                              color={C.red}    sm={sm} />
        <MetricCard icon="📅" label="Last 7 Days"          value={peso(last7Amt)}                                  color={C.amber}  sm={sm} />
        <MetricCard icon="🔢" label="Total Entries"         value={String(allTx.length)}                            color={C.blue}   sm={sm} />
        <MetricCard icon="🏆" label="Largest Transaction"   value={biggestTx ? peso(biggestTx.amount) : '₱0'}      sub={biggestTx?.description || '—'} color={C.purple} sm={sm} />
      </div>

      {/* ── New Transaction Form ── */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? 16 : 0 }}>
          <SecTitle style={{ margin: 0 }}>
            {showForm ? (editingLedgerTx ? '✏️ Edit Transaction' : (txType === 'debit' ? '⚡ Log New Debit' : '💰 Log New Credit')) : '⚡ Log New Transaction'}
          </SecTitle>
          {canWrite && (
            <button onClick={() => {
              if (showForm && editingLedgerTx) {
                handleCancelEditLedgerTx();
              }
              setShowForm(p => !p);
            }}
              style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${showForm ? C.red : C.blue}`, background: showForm ? `${C.red}18` : `${C.blue}18`, color: showForm ? C.red : C.blue, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              {showForm ? '✕ Close' : '+ New Transaction'}
            </button>
          )}
        </div>

        {showForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Transaction Type Pills */}
            <div style={{ display: 'flex', background: `${C.card2}`, padding: 4, borderRadius: 8, gap: 4, marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => setTxType('debit')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 6,
                  background: txType === 'debit' ? `linear-gradient(135deg, ${C.red}, ${C.orange})` : 'transparent',
                  color: txType === 'debit' ? '#fff' : C.muted,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                💸 Debit (Outflow)
              </button>
              <button
                type="button"
                onClick={() => setTxType('credit')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 6,
                  background: txType === 'credit' ? `linear-gradient(135deg, ${C.green}, ${C.teal})` : 'transparent',
                  color: txType === 'credit' ? '#fff' : C.muted,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                💰 Credit (Deposit/Inflow)
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {txType === 'debit' ? 'From Account' : 'To Account (Deposit)'}
                </label>
                <select value={selectedAccId} onChange={e => setSelectedAccId(e.target.value)} disabled={readOnly}
                  style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="" disabled>Select Account</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({peso(acc.balance)})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Description</label>
                <Inp type="text" value={debitDesc} onChange={e => setDebitDesc(e.target.value)} placeholder={txType === 'debit' ? 'e.g. Grocery, Medicine, Utilities' : 'e.g. Salary, Dividend, Transfer In'} />
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
                  style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <option value="5th">5th Payroll (1st–15th)</option>
                  <option value="20th">20th Payroll (16th–31st)</option>
                </select>
              </div>
            </div>

            {txType === 'debit' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="excludeFromBudget"
                  checked={excludeFromBudget}
                  onChange={e => setExcludeFromBudget(e.target.checked)}
                  disabled={readOnly}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                    accentColor: C.blue,
                  }}
                />
                <label htmlFor="excludeFromBudget" style={{ fontSize: 12, color: C.text, cursor: 'pointer', fontWeight: 500 }}>
                  Exclude from Budget <span style={{ color: C.muted, fontSize: 11 }}>(Deducts from account but won't add an expense item to the monthly budget)</span>
                </label>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {canWrite && (
                <button onClick={handleDebit}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 7,
                    border: 'none',
                    background: editingLedgerTx
                      ? `linear-gradient(135deg, ${C.blue}, ${C.teal})`
                      : (txType === 'debit'
                        ? `linear-gradient(135deg, ${C.red}, ${C.orange})`
                        : `linear-gradient(135deg, ${C.green}, ${C.teal})`),
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: editingLedgerTx
                      ? '0 4px 14px rgba(33,150,243,0.3)'
                      : (txType === 'debit'
                        ? '0 4px 14px rgba(255,81,79,0.3)'
                        : '0 4px 14px rgba(36,209,126,0.3)'),
                    transition: 'all 0.2s ease'
                  }}>
                  {editingLedgerTx ? '💾 Save Changes' : (txType === 'debit' ? '⚡ Deduct & Log' : '💰 Deposit & Log')}
                </button>
              )}
              {editingLedgerTx && (
                <button onClick={handleCancelEditLedgerTx}
                  style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Cancel
                </button>
              )}
              {debitSuccessMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {debitSuccessMsg}</span>}
            </div>
          </div>
        )}
      </Card>

      {/* ── Filters ── */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>Source:</span>
          {[['all','🔀 All'],['manual','💸 Manual'],['cc','💳 CC Charge'],['installment','📦 Installment']].map(([v,l]) => (
            <button key={v} onClick={() => setFilterSource(v)}
              style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${filterSource===v ? C.blue : C.border}`, background: filterSource===v ? `${C.blue}22` : 'transparent', color: filterSource===v ? C.blue : C.muted, cursor: 'pointer', fontSize: 12, fontWeight: filterSource===v ? 700 : 400, transition: 'all 0.15s' }}>
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
            style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: 'none' }}>
            <option value="all">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {(filterSearch || filterDateFrom || filterDateTo || filterAccount !== 'all') && (
            <button onClick={() => { setFilterSearch(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterAccount('all'); }}
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </Card>

      {/* ── Transaction Ledger Table ── */}
      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SecTitle style={{ margin: 0 }}>Transaction Ledger</SecTitle>
          <span style={{ fontSize: 11, color: C.muted }}>
            {filtered.length} / {allTx.length} entries
            {filtered.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 700 }}>
                Net: {(() => {
                  const net = filtered.reduce((s, t) => s + (t.isCredit ? (t.amount || 0) : -(t.amount || 0)), 0);
                  return (
                    <span style={{ color: net >= 0 ? C.green : C.red }}>
                      {net >= 0 ? '+' : '−'}{peso(Math.abs(net))}
                    </span>
                  );
                })()}
              </span>
            )}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
            {allTx.length === 0 ? '📭 No transactions yet. Click "+ New Transaction" to log your first one.' : '🔍 No results match your filters.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }}>
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
                    style={{ borderBottom: `1px solid ${C.border}18`, transition: 'background 0.12s', cursor: 'default' }}
                    onMouseEnter={e => e.currentTarget.style.background = `${C.panel}88`}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '9px 8px', color: C.muted, whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ padding: '9px 8px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{tx.description}</span>
                        {tx.excludeFromBudget && !tx.isCredit && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${C.muted}22`, color: C.muted, fontWeight: 700 }}>
                            Unbudgeted
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '9px 8px', color: C.muted }}>{tx.accountName}</td>
                    <td style={{ padding: '9px 8px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: `${tx.isCredit ? C.green : (SRC_CLR[tx.source]||C.muted)}22`, color: tx.isCredit ? C.green : (SRC_CLR[tx.source]||C.muted) }}>
                        {tx.isCredit ? '💰' : SRC_PILL[tx.source]} {tx.sourceLabel}
                      </span>
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', fontSize: 11, color: C.muted }}>{tx.period || '—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: tx.isCredit ? C.green : C.red }}>
                      {tx.isCredit ? '+' : '−'}{peso(tx.amount)}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                      {canUpdate && (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button onClick={() => handleStartEditLedgerTx(tx)} title="Edit Transaction Details"
                            style={{ background: 'none', border: `1px solid ${C.blue}44`, borderRadius: 5, color: C.blue, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✏️</button>
                          <button onClick={() => handleDeleteTx(tx)} title={tx.isCredit ? "Remove Credit" : "Refund & Delete"}
                            style={{ background: 'none', border: `1px solid ${C.red}44`, borderRadius: 5, color: C.red, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>↩</button>
                        </div>
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

  // ── Chart data ──
  const chartData = [...balanceHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(h => ({ date: h.date.slice(5), total: Math.round(Object.values(h.balances).reduce((s, v) => s + (Number(v) || 0), 0) / 1000) }));

  // ── Metrics ──
  const sorted   = [...balanceHistory].sort((a, b) => b.date.localeCompare(a.date));
  const lastLog  = sorted[0];
  const prevLog  = sorted[1];
  const lastTot  = lastLog ? Object.values(lastLog.balances).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const prevTot  = prevLog ? Object.values(prevLog.balances).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const diff     = lastTot - prevTot;

  return (
    <div>
      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
        <MetricCard icon="📅" label="Last Snapshot Date"      value={lastLog?.date || '—'}                               color={C.blue}  sm={sm} />
        <MetricCard icon="💰" label="Net Worth at Last Log"   value={lastTot ? peso(lastTot) : '₱0'}                     color={C.green} sm={sm} />
        <MetricCard icon={diff >= 0 ? '📈' : '📉'} label="Change vs Previous" value={(diff >= 0 ? '+' : '') + peso(diff)} color={diff >= 0 ? C.green : C.red} sm={sm} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* ── Left: Form + History ── */}
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
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                      <th style={{ textAlign: 'left',  padding: '6px 6px' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '6px 6px' }}>Net Worth</th>
                      <th style={{ textAlign: 'center',padding: '6px 6px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...balanceHistory].sort((a,b) => b.date.localeCompare(a.date)).slice(0,10).map(log => {
                      const tot = Object.values(log.balances).reduce((s,v) => s+(Number(v)||0), 0);
                      return (
                        <tr key={log.date} style={{ borderBottom: `1px solid ${C.border}18` }}>
                          <td style={{ padding: '8px 6px' }}>{log.date}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: C.green }}>{peso(tot)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            <button onClick={() => { setLogDate(log.date); setLogBalances({...log.balances}); }}
                              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '2px 7px', cursor: 'pointer', fontSize: 10, marginRight: 4 }}>Load</button>
                            {canUpdate && (
                              <button onClick={() => { if(confirm(`Delete snapshot for ${log.date}?`)) setBalanceHistory(p => p.filter(h => h.date !== log.date)); }}
                                style={{ background: 'none', border: `1px solid ${C.red}44`, borderRadius: 4, color: C.red, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>Del</button>
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

        {/* ── Right: Chart ── */}
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
                <CartesianGrid strokeDasharray="3 3" stroke={`${C.border}55`} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttip} formatter={v => [`₱${(v*1000).toLocaleString()}`,'Net Worth']} />
                <Area type="monotone" dataKey="total" stroke={C.green} strokeWidth={2.5} fill="url(#balGrad)" dot={{ fill: C.green, r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}


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
        <MetricCard icon="📊" label="Live Ledger Total"    value={peso(liveTotal)}                                              color={C.purple}                      sm={sm} sub={`${accounts.length} accounts`} />
        <MetricCard icon="⚖️"  label="Reconciliation Variance" value={(variance > 0 ? '+' : '') + peso(variance)}              color={Math.abs(variance) < 100 ? C.green : C.red} sm={sm} sub={Math.abs(variance) < 100 ? 'Balanced ✓' : 'Review needed'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* ── Left: Snapshot Form + History ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Snapshot Form */}
          <Card style={{ marginBottom: 0, border: `1px solid ${C.green}33` }}>
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
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
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
                        <tr key={log.date} style={{ borderBottom: `1px solid ${C.border}18` }}>
                          <td style={{ padding: '9px 8px', fontWeight: 600 }}>{log.date}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 700, color: C.green }}>{peso(tot)}</td>
                          <td style={{ padding: '9px 8px', textAlign: 'right', fontSize: 11 }}>
                            {chg !== null ? (
                              <span style={{ color: chg >= 0 ? C.green : C.red, fontWeight: 600 }}>{chg >= 0 ? '+' : ''}{peso(chg)}</span>
                            ) : <span style={{ color: C.muted }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                            <button onClick={() => { setLogDate(log.date); setLogBalances({ ...log.balances }); }}
                              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '2px 7px', cursor: 'pointer', fontSize: 10, marginRight: 4 }}>Load</button>
                            {canUpdate && (
                              <button onClick={() => { if (confirm(`Delete audit snapshot for ${log.date}?`)) setBalanceHistory(p => p.filter(h => h.date !== log.date)); }}
                                style={{ background: 'none', border: `1px solid ${C.red}44`, borderRadius: 4, color: C.red, padding: '2px 7px', cursor: 'pointer', fontSize: 10 }}>Del</button>
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
                <CartesianGrid strokeDasharray="3 3" stroke={`${C.border}44`} />
                <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={ttip} formatter={v => [`₱${(v * 1000).toLocaleString()}`, 'Net Worth']} />
                <Area type="monotone" dataKey="total" stroke={C.green} strokeWidth={2.5} fill="url(#recGrad)" dot={{ fill: C.green, r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── MAJOR EXPENSES / GOALS ────────────────────────────────────────────
function MajorTab({majorExpenses,setMajorExpenses,sm,readOnly,canWrite,canUpdate}) {
  const [activeView, setActiveView] = useState('active');
  const [histYear,   setHistYear]   = useState('all');

  const active  = majorExpenses.filter(e => !e.done);
  const history = majorExpenses.filter(e => e.done);
  const histFiltered = histYear === 'all' ? history : history.filter(e => (e.doneDate || '').startsWith(histYear));

  const totBudget  = active.reduce((s, e) => s + (e.budget || 0), 0);
  const onTrack    = active.filter(e => e.budget > 0 && e.actual <= e.budget).length;
  const onTrackPct = active.length > 0 ? Math.round(onTrack / active.length * 100) : 100;
  const histYears  = [...new Set(history.map(e => (e.doneDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();

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
        <MetricCard icon="🎯" label="Active Goals"    value={active.length.toString()}  color={C.amber} sm={sm} sub={active.length === 0 ? 'All done! 🎉' : `${active.length} pending`} />
        <MetricCard icon="💰" label="Total Budgeted"  value={peso(totBudget)}            color={C.blue}  sm={sm} />
        <MetricCard icon="✅" label="Completed Goals" value={history.length.toString()}  color={C.green} sm={sm} sub="all time" />
        <MetricCard icon="📊" label="Goals On-Track"  value={`${onTrackPct}%`}           color={onTrackPct >= 80 ? C.green : C.red} sm={sm} sub={`${onTrack} of ${active.length} active`} />
      </div>

      {/* ── View Toggle ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['active', `🎯 Active Goals (${active.length})`], ['history', `✅ Completed / History (${history.length})`]].map(([v, label]) => (
          <button key={v} onClick={() => setActiveView(v)}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${activeView === v ? C.amber : C.border}`,
              background: activeView === v ? `${C.amber}22` : 'transparent',
              color: activeView === v ? C.amber : C.muted, transition: 'all 0.15s' }}>
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
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>No active goals. Add a new one to get started.</div>
              {canWrite && <BtnG onClick={addGoal} style={{ padding: '8px 20px', fontSize: 12 }}>+ Add New Goal</BtnG>}
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(auto-fill, minmax(310px, 1fr))', gap: 14 }}>
              {active.map(e => {
                const pct = e.budget > 0 ? Math.min(100, Math.round(e.actual / e.budget * 100)) : 0;
                const rem = (e.budget || 0) - (e.actual || 0);
                return (
                  <Card key={e.id} style={{ marginBottom: 0, border: `1px solid ${rem >= 0 ? C.green : C.red}33` }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                      <Inp value={e.name} onChange={ev => upd(e.id, 'name', ev.target.value)}
                        style={{ flex: 1, fontWeight: 700, fontSize: 13 }} disabled={readOnly} />
                      {canUpdate && (
                        <button onClick={() => setMajorExpenses(p => p.filter(x => x.id !== e.id))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Budget</div>
                        <Inp type="number" value={e.budget || ''} onChange={ev => upd(e.id, 'budget', ev.target.value)} placeholder="₱0" style={{ textAlign: 'right' }} disabled={readOnly} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Actual Spent</div>
                        <Inp type="number" value={e.actual || ''} onChange={ev => upd(e.id, 'actual', ev.target.value)} placeholder="₱0" style={{ textAlign: 'right' }} disabled={readOnly} />
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: `${C.border}44`, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? C.red : pct > 70 ? C.amber : C.blue, borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 12 }}>
                      <span style={{ color: C.text, fontWeight: 600 }}>{peso(e.actual || 0)} spent</span>
                      <span>{pct}% · <span style={{ color: rem >= 0 ? C.green : C.red }}>{rem >= 0 ? peso(rem) + ' left' : peso(Math.abs(rem)) + ' over'}</span></span>
                    </div>
                    {canUpdate && (
                      <button onClick={() => markDone(e.id)}
                        style={{ width: '100%', padding: '7px', borderRadius: 6, border: `1px solid ${C.green}55`, background: `${C.green}18`, color: C.green, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
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
                style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}>
                <option value="all">All Years</option>
                {histYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
          {histFiltered.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.muted, padding: '32px 0', fontSize: 13 }}>No completed goals yet. Mark active goals as done to see them here.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {histFiltered.map(e => {
                const pct = e.budget > 0 ? Math.min(100, Math.round(e.actual / e.budget * 100)) : 0;
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: `${C.green}08`, border: `1px solid ${C.green}22` }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>✅</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        Spent {peso(e.actual || 0)} of {peso(e.budget || 0)} · {pct}%
                        {e.doneDate && <span style={{ marginLeft: 8, color: C.green }}>· Completed: {e.doneDate}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {canUpdate && (
                        <button onClick={() => reopen(e.id)}
                          style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>↩ Reopen</button>
                      )}
                      {canUpdate && (
                        <button onClick={() => setMajorExpenses(p => p.filter(x => x.id !== e.id))}
                          style={{ background: 'none', border: `1px solid ${C.red}44`, borderRadius: 5, color: C.red, padding: '3px 10px', cursor: 'pointer', fontSize: 10 }}>Delete</button>
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
}


// ─── CREDITS ──────────────────────────────────────────────────────────────────
function CreditsTab({ credits, setCredits, sm, readOnly, canWrite, canUpdate }) {
  const tot = credits.filter(c => !c.done).reduce((s, c) => s + c.amount, 0);
  const collected = credits.filter(c => c.done).reduce((s, c) => s + c.amount, 0);
  function upd(id, f, v) { 
    if (readOnly) return;
    setCredits(p => p.map(c => c.id === id ? { ...c, [f]: f === 'amount' ? (Number(v) || 0) : v } : c)); 
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sm ? 8 : 12, marginBottom: 14 }}>
        <MetricCard label="Total Owed" value={fmtK(tot)} color={C.amber} sm={sm} />
        <MetricCard label="Collected" value={fmtK(collected)} color={C.green} sm={sm} />
      </div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SecTitle>Money Owed to Me</SecTitle>
          {canWrite && (
            <BtnG style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setCredits(p => [...p, { id: Date.now(), name: 'New Person', amount: 0, done: false }])}>+ Add Credit</BtnG>
          )}
        </div>
        {credits.map(c => (
          <div key={c.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}22` }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Inp value={c.name} onChange={ev => upd(c.id, 'name', ev.target.value)} style={{ flex: 1, opacity: c.done ? 0.5 : 1 }} placeholder="Who owes you?" disabled={readOnly}/>
              {canUpdate && <button onClick={() => upd(c.id, 'done', !c.done)} style={{ minWidth: 80, background: 'none', border: `1px solid ${c.done ? C.green : C.border}`, borderRadius: 6, padding: '8px 6px', cursor: 'pointer', color: c.done ? C.green : C.muted, fontSize: 11, whiteSpace: 'nowrap' }}>{c.done ? '✓ Paid' : 'Pending'}</button>}
              {canUpdate && <button onClick={() => setCredits(p => p.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18 }}>×</button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Amount</div><Inp type="number" value={c.amount || ''} onChange={ev => upd(c.id, 'amount', ev.target.value)} placeholder="0" disabled={readOnly}/></div>
            </div>
          </div>
        ))}
        {credits.length === 0 && <div style={{ textAlign: 'center', color: C.muted, padding: '20px 0', fontSize: 14 }}>No credits listed yet.</div>}
      </Card>
    </div>
  );
}

// ─── INVESTMENTS ──────────────────────────────────────────────────────────────
function InvestmentsTab({ accounts, setAccounts, sm, readOnly, canWrite, canUpdate }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(null);

  const investments = accounts.filter(a => a.type === 'Investment' || a.name.toLowerCase().includes('capcon') || a.name.toLowerCase().includes('mp2'));
  const totalInvested = investments.reduce((sum, a) => sum + a.balance, 0);

  function startEdit(acc) {
    setEditData({ ...acc });
    setEditing(acc.id);
  }

  function saveEdit() {
    setAccounts(p => p.map(a => a.id === editing ? editData : a));
    setEditing(null);
    setEditData(null);
  }

  const COLORS = [C.green, C.blue, C.purple, C.teal, C.orange, C.amber];
  const chartData = investments.map(a => ({ name: a.name, value: a.balance }));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 2fr', gap: 14, marginBottom: 14 }}>
        <MetricCard label="Total Portfolio Value" value={peso(totalInvested)} color={C.green} sm={sm} />
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Asset Allocation</SecTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <ResponsiveContainer width={sm ? '100%' : 150} height={130}>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={2}>
                  {chartData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={ttip} formatter={v => peso(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, minWidth: 150 }}>
              {investments.map((inv, idx) => {
                const pct = totalInvested > 0 ? ((inv.balance / totalInvested) * 100).toFixed(1) : 0;
                return (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, background: COLORS[idx % COLORS.length], borderRadius: '50%' }} />
                      {inv.name}
                    </span>
                    <span style={{ color: C.muted }}>{peso(inv.balance)} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SecTitle>Investment Assets</SecTitle>
          {canWrite && (
            <BtnG onClick={() => {
              const id = 'acc-' + Date.now();
              const newItem = { id, name: 'New Investment Asset', balance: 0, type: 'Investment' };
              setAccounts(p => [...p, newItem]);
              startEdit(newItem);
            }}>+ Add Asset</BtnG>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0d1117', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: '8px', textAlign: 'left', color: C.muted }}>Asset Name</th>
              <th style={{ padding: '8px', textAlign: 'right', color: C.muted }}>Value (₱)</th>
              <th style={{ padding: '8px', textAlign: 'center', color: C.muted }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {investments.map(inv => (
              <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                {editing === inv.id ? (
                  <>
                    <td style={{ padding: '6px' }}><Inp value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} disabled={readOnly}/></td>
                    <td style={{ padding: '6px' }}><Inp type="number" value={editData.balance} onChange={e => setEditData({ ...editData, balance: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} disabled={readOnly}/></td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>
                      <button onClick={saveEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.green, marginRight: 8, fontSize: 16 }}>✓</button>
                      <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16 }}>×</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{inv.name}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.green, fontWeight: 700 }}>{peso(inv.balance)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {canUpdate && <button onClick={() => startEdit(inv)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer', color: C.muted, padding: '2px 8px', fontSize: 11, marginRight: 4 }}>Edit</button>}
                      {canUpdate && <button onClick={() => setAccounts(p => p.filter(x => x.id !== inv.id))} style={{ background: 'none', border: `1px solid ${C.red}33`, borderRadius: 4, cursor: 'pointer', color: C.red, padding: '2px 8px', fontSize: 11 }}>Delete</button>}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── DEBT MANAGER ─────────────────────────────────────────────────────────────
function DebtsTab({ debts, setDebts, accounts = [], setAccounts = () => {}, budgetData, setBudgetData, sm, readOnly, canWrite, canUpdate }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(null);

  const totalOwed = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalLimit = debts.reduce((sum, d) => sum + d.limit, 0);
  const avgUtilization = totalLimit > 0 ? (totalOwed / totalLimit) * 100 : 0;

  // ── Installment Plan Tracker ───────────────────────────────────────────
  const [instPlans, setInstPlans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bg_installments') || '[]'); } catch { return []; }
  });
  const [showInstForm, setShowInstForm]     = useState(false);
  const [editingPlanId, setEditingPlanId]   = useState(null);
  const [newInst, setNewInst]               = useState({
    cardId: '', item: '', total: '', months: 12, startMonth: new Date().toISOString().slice(0,7),
    interestRate: '', customMonthly: ''
  });
  const [instSuccessMsg, setInstSuccessMsg] = useState('');

  // Paying States
  const [payingPlanId, setPayingPlanId] = useState(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payLogBudget, setPayLogBudget] = useState(true);
  const [payPeriod, setPayPeriod] = useState(new Date().getDate() <= 15 ? '5th' : '20th');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [historyExpandedPlanId, setHistoryExpandedPlanId] = useState(null);

  const getInstallmentBreakdown = (total, months, interestRate, customMonthly) => {
    const p = Number(total) || 0;
    const m = Number(months) || 12;
    const r = Number(interestRate) || 0;
    const c = Number(customMonthly) || 0;

    let monthly = 0;
    let totalInterest = 0;
    let monthlyInterest = 0;
    let monthlyPrincipal = 0;

    if (c > 0) {
      monthly = c;
      const totalPaid = c * m;
      totalInterest = Math.max(0, totalPaid - p);
      monthlyInterest = totalInterest / m;
      monthlyPrincipal = p / m;
    } else {
      // CC Add-on interest style (common for merchant installments)
      monthlyInterest = p * (r / 100 / 12);
      monthlyPrincipal = p / m;
      monthly = monthlyPrincipal + monthlyInterest;
      totalInterest = monthlyInterest * m;
    }

    return {
      monthly: Math.ceil(monthly),
      monthlyInterest: Math.ceil(monthlyInterest),
      monthlyPrincipal: Math.ceil(monthlyPrincipal),
      totalInterest: Math.ceil(totalInterest),
      totalCost: Math.ceil(p + totalInterest)
    };
  };

  const saveInstPlans = (plans) => {
    setInstPlans(plans);
    try { localStorage.setItem('bg_installments', JSON.stringify(plans)); } catch {}
  };

  const addInstPlan = () => {
    if (!newInst.cardId) return alert('Select a credit card');
    if (!newInst.item.trim()) return alert('Enter the item description');
    if (!newInst.total || Number(newInst.total) <= 0) return alert('Enter the total amount');
    const card = debts.find(d => d.id === newInst.cardId);

    if (editingPlanId) {
      const updated = instPlans.map(p => p.id === editingPlanId ? {
        ...p,
        cardId: newInst.cardId,
        cardName: card?.name || 'Unknown',
        item: newInst.item.trim(),
        total: Number(newInst.total),
        months: Number(newInst.months) || 12,
        startMonth: newInst.startMonth,
        interestRate: newInst.interestRate ? Number(newInst.interestRate) : 0,
        customMonthly: newInst.customMonthly ? Number(newInst.customMonthly) : 0
      } : p);
      saveInstPlans(updated);
      setEditingPlanId(null);
      setInstSuccessMsg('Plan updated!');
    } else {
      const plan = {
        id: 'inst-' + Date.now(),
        cardId: newInst.cardId,
        cardName: card?.name || 'Unknown',
        item: newInst.item.trim(),
        total: Number(newInst.total),
        months: Number(newInst.months) || 12,
        startMonth: newInst.startMonth,
        paidMonths: 0,
        interestRate: newInst.interestRate ? Number(newInst.interestRate) : 0,
        customMonthly: newInst.customMonthly ? Number(newInst.customMonthly) : 0,
        createdAt: new Date().toISOString().slice(0,10)
      };
      saveInstPlans([...instPlans, plan]);
      setInstSuccessMsg('Plan added!');
    }
    setNewInst({ cardId: '', item: '', total: '', months: 12, startMonth: new Date().toISOString().slice(0,7), interestRate: '', customMonthly: '' });
    setShowInstForm(false);
    setTimeout(() => setInstSuccessMsg(''), 3000);
  };

  const handleStartEditPlan = (plan) => {
    setEditingPlanId(plan.id);
    setNewInst({
      cardId: plan.cardId,
      item: plan.item,
      total: plan.total,
      months: plan.months,
      startMonth: plan.startMonth,
      interestRate: plan.interestRate || '',
      customMonthly: plan.customMonthly || ''
    });
    setShowInstForm(true);
  };

  const confirmInstallmentPayment = (plan, monthly) => {
    // 1. Increment paidMonths
    saveInstPlans(instPlans.map(p => p.id === plan.id ? { ...p, paidMonths: Math.min(p.paidMonths + 1, p.months) } : p));

    // 2. Account Deduction
    if (payAccountId) {
      setAccounts(prev => prev.map(a => a.id === payAccountId ? { ...a, balance: a.balance - monthly } : a));
    }

    const account = accounts.find(a => a.id === payAccountId);
    const accountName = account ? account.name : 'Unknown Account';

    // 3. Budget & History Updates
    if (payLogBudget) {
      const key = payDate.slice(0, 7);
      const period = payPeriod;

      setBudgetData(prev => {
        // Add expense line item to budget
        const monthData = prev[key] || makeMonthData();
        const periodData = monthData[period] || makePeriod();
        const expenseName = `Installment: ${plan.item} (${plan.cardName})`;
        const newExpense = { name: expenseName, budget: monthly, amount: monthly, done: true };

        // Log transaction history
        const newTx = {
          id: 'inst-tx-' + Date.now(),
          accountId: payAccountId || 'none',
          accountName: payAccountId ? accountName : 'No Account Deducted',
          amount: monthly,
          description: `Installment Payment: ${plan.item} (${plan.cardName})`,
          date: payDate,
          period: period,
          planId: plan.id,
          timestamp: new Date().toISOString()
        };

        return {
          ...prev,
          [key]: {
            ...monthData,
            [period]: {
              ...periodData,
              expenses: [...periodData.expenses, newExpense]
            }
          },
          installmentHistory: [newTx, ...(prev.installmentHistory || [])]
        };
      });
    } else {
      // Just log transaction history, no budget impact
      setBudgetData(prev => {
        const newTx = {
          id: 'inst-tx-' + Date.now(),
          accountId: payAccountId || 'none',
          accountName: payAccountId ? accountName : 'No Account Deducted',
          amount: monthly,
          description: `Installment Payment: ${plan.item} (${plan.cardName})`,
          date: payDate,
          period: payPeriod,
          planId: plan.id,
          timestamp: new Date().toISOString()
        };

        return {
          ...prev,
          installmentHistory: [newTx, ...(prev.installmentHistory || [])]
        };
      });
    }

    setPayingPlanId(null);
  };

  const unpayInstMonth = (id) => {
    if (!window.confirm('Undo 1 paid month for this installment plan?')) return;
    saveInstPlans(instPlans.map(p => p.id === id ? { ...p, paidMonths: Math.max(0, p.paidMonths - 1) } : p));
  };

  const deleteSpecificInstallmentPayment = (tx) => {
    const msg = `Undo payment of ₱${(tx.amount || 0).toLocaleString()} made on ${tx.date} (${tx.period || '5th'} Payroll)?`;
    if (!window.confirm(msg)) return;

    // 1. Revert account balance
    if (tx.accountId && tx.accountId !== 'none') {
      setAccounts(prev => prev.map(a => a.id === tx.accountId ? { ...a, balance: a.balance + tx.amount } : a));
    }

    // 2. Remove budget expense & transaction log
    const key = (tx.date || '').slice(0, 7);
    const expName = `Installment: ${tx.description.replace('Installment Payment: ', '')}`;

    setBudgetData(prev => {
      const md = prev[key] || makeMonthData();
      const pd = md[tx.period] || makePeriod();

      const newBudgetData = {
        ...prev,
        installmentHistory: (prev.installmentHistory || []).filter(h => h.id !== tx.id)
      };

      if (key && tx.period && md[tx.period]) {
        newBudgetData[key] = {
          ...md,
          [tx.period]: {
            ...pd,
            expenses: pd.expenses.filter(e => !(e.name === expName && e.amount === tx.amount))
          }
        };
      }

      return newBudgetData;
    });

    // 3. Decrement paidMonths on matching plan
    if (tx.planId) {
      saveInstPlans(instPlans.map(p => p.id === tx.planId ? { ...p, paidMonths: Math.max(0, p.paidMonths - 1) } : p));
    }
  };
  const deleteInstPlan = (id) => { if (window.confirm('Delete this installment plan?')) saveInstPlans(instPlans.filter(p => p.id !== id)); };
  const activeInstPlans    = instPlans.filter(p => p.paidMonths < p.months);
  const completedInstPlans = instPlans.filter(p => p.paidMonths >= p.months);
  const totalMonthlyInst   = activeInstPlans.reduce((s, p) => {
    const bd = getInstallmentBreakdown(p.total, p.months, p.interestRate, p.customMonthly);
    return s + bd.monthly;
  }, 0);
  const totalPaidInInst    = instPlans.reduce((s, p) => {
    const bd = getInstallmentBreakdown(p.total, p.months, p.interestRate, p.customMonthly);
    return s + (p.paidMonths * bd.monthly);
  }, 0);


  // Credit Card Transaction States
  const [selectedCardId, setSelectedCardId] = useState(debts[0]?.id || '');
  const [ccAmount, setCcAmount] = useState('');
  const [ccDesc, setCcDesc] = useState('');
  const [ccCategory, setCcCategory] = useState('Food');
  const [ccDate, setCcDate] = useState(new Date().toISOString().slice(0, 10));
  const [ccPeriod, setCcPeriod] = useState(new Date().getDate() <= 15 ? '5th' : '20th');
  const [ccSuccessMsg, setCcSuccessMsg] = useState('');
  const [ccFilterDate, setCcFilterDate] = useState('');

  // Editing CC Transactions States & Logic
  const [editingTxId, setEditingTxId] = useState(null);
  const [editTxData, setEditTxData] = useState(null);

  const startEditTx = (tx) => {
    setEditingTxId(tx.id);
    setEditTxData({
      cardId: tx.cardId,
      amount: tx.amount,
      category: tx.category || 'Others',
      description: tx.description,
      date: tx.date,
      period: tx.period
    });
  };

  const cancelEditTx = () => {
    setEditingTxId(null);
    setEditTxData(null);
  };

  const handleEditTxDateChange = (val) => {
    const day = Number(val.split('-')[2]) || 1;
    const period = day <= 15 ? '5th' : '20th';
    setEditTxData(prev => ({ ...prev, date: val, period }));
  };

  const saveEditTx = () => {
    if (!editTxData.cardId) return alert('Please select a credit card account');
    if (!editTxData.amount || Number(editTxData.amount) <= 0) return alert('Please enter a valid amount');
    if (!editTxData.description.trim()) return alert('Please enter a description');

    const originalTx = budgetData.ccHistory?.find(t => t.id === editingTxId);
    if (!originalTx) return cancelEditTx();

    const oldCardId = originalTx.cardId;
    const oldAmount = originalTx.amount;
    const oldKey = originalTx.date.slice(0, 7);
    const oldPeriod = originalTx.period;
    const oldExpenseName = `[${originalTx.category || 'Others'}] ${originalTx.description} (${originalTx.cardName})`;

    const newCardId = editTxData.cardId;
    const newCard = debts.find(d => d.id === newCardId);
    if (!newCard) return alert('Card not found');
    const newAmount = Number(editTxData.amount);
    const newKey = editTxData.date.slice(0, 7);
    const newPeriod = editTxData.period;
    const newExpenseName = `[${editTxData.category}] ${editTxData.description.trim()} (${newCard.name})`;

    // 1. Adjust card outstanding balances
    setDebts(prev => {
      return prev.map(d => {
        let bal = d.balance;
        if (d.id === oldCardId) {
          bal = Math.max(0, bal - oldAmount);
        }
        if (d.id === newCardId) {
          bal = bal + newAmount;
        }
        return { ...d, balance: bal };
      });
    });

    // 2. Adjust budget expenses & ccHistory
    setBudgetData(prev => {
      let updatedData = { ...prev };

      // Step A: Remove old expense
      const oldMonthData = updatedData[oldKey];
      if (oldMonthData) {
        const oldPeriodData = oldMonthData[oldPeriod];
        if (oldPeriodData) {
          updatedData[oldKey] = {
            ...oldMonthData,
            [oldPeriod]: {
              ...oldPeriodData,
              expenses: oldPeriodData.expenses.filter(e => !(e.name === oldExpenseName && e.amount === oldAmount))
            }
          };
        }
      }

      // Step B: Insert new expense
      const targetMonthData = updatedData[newKey] || makeMonthData();
      const targetPeriodData = targetMonthData[newPeriod] || makePeriod();
      const newExpense = {
        name: newExpenseName,
        budget: newAmount,
        amount: newAmount,
        done: true
      };
      updatedData[newKey] = {
        ...targetMonthData,
        [newPeriod]: {
          ...targetPeriodData,
          expenses: [...targetPeriodData.expenses, newExpense]
        }
      };

      // Step C: Update history entry
      updatedData.ccHistory = (prev.ccHistory || []).map(tx => {
        if (tx.id === editingTxId) {
          return {
            ...tx,
            cardId: newCardId,
            cardName: newCard.name,
            amount: newAmount,
            category: editTxData.category,
            description: editTxData.description.trim(),
            date: editTxData.date,
            period: newPeriod
          };
        }
        return tx;
      });

      return updatedData;
    });

    cancelEditTx();
  };

  const CAT_COLORS = {
    Food: '#388bfd',
    Grocery: '#56d364',
    Utilities: '#d29922',
    Shopping: '#f85149',
    Travel: '#bc8cff',
    Entertainment: '#ff7b72',
    Health: '#3fb950',
    Others: '#7d8590'
  };

  // Keep selectedCardId updated if debts array changes
  useEffect(() => {
    if (debts.length > 0 && !selectedCardId) {
      setSelectedCardId(debts[0].id);
    }
  }, [debts, selectedCardId]);

  const handleCcDateChange = (val) => {
    setCcDate(val);
    const day = Number(val.split('-')[2]) || 1;
    setCcPeriod(day <= 15 ? '5th' : '20th');
  };

  const handleCCTransaction = () => {
    const cardId = selectedCardId || debts[0]?.id;
    if (!cardId) return alert('Please select a credit card account');
    if (!ccAmount || Number(ccAmount) <= 0) return alert('Please enter a valid amount');
    if (!ccDesc.trim()) return alert('Please enter a description');

    const card = debts.find(d => d.id === cardId);
    if (!card) return;

    const amount = Number(ccAmount);
    const dateStr = ccDate;
    const period = ccPeriod;
    const key = dateStr.slice(0, 7);

    // 1. Increase outstanding balance on card
    setDebts(prev => prev.map(d => d.id === cardId ? { ...d, balance: d.balance + amount } : d));

    // 2. Add expense and log history to budgetData
    setBudgetData(prev => {
      const monthData = prev[key] || makeMonthData();
      const periodData = monthData[period] || makePeriod();

      const newExpense = {
        name: `[${ccCategory}] ${ccDesc.trim()} (${card.name})`,
        budget: amount,
        amount: amount,
        done: true
      };

      const updatedExpenses = [...periodData.expenses, newExpense];
      const prevHistory = prev.ccHistory || [];
      const newHistoryItem = {
        id: 'cctx-' + Date.now(),
        cardId: cardId,
        cardName: card.name,
        amount,
        category: ccCategory,
        description: ccDesc.trim(),
        date: dateStr,
        period,
        timestamp: new Date().toISOString()
      };

      return {
        ...prev,
        [key]: {
          ...monthData,
          [period]: {
            ...periodData,
            expenses: updatedExpenses
          }
        },
        ccHistory: [newHistoryItem, ...prevHistory]
      };
    });

    setCcAmount('');
    setCcDesc('');
    setCcSuccessMsg('Transaction logged!');
    setTimeout(() => setCcSuccessMsg(''), 3000);
  };

  const handleDeleteCCTransaction = (tx) => {
    if (!confirm(`Refund ₱${tx.amount.toLocaleString()} from ${tx.cardName} balance and delete the logged expense?`)) return;

    // 1. Deduct balance from outstanding card balance
    setDebts(prev => prev.map(d => d.id === tx.cardId ? { ...d, balance: Math.max(0, d.balance - tx.amount) } : d));

    // 2. Remove expense & history log
    const key = tx.date.slice(0, 7);
    const period = tx.period;
    const expenseName = `[${tx.category}] ${tx.description} (${tx.cardName})`;

    setBudgetData(prev => {
      const monthData = prev[key] || makeMonthData();
      const periodData = monthData[period] || makePeriod();

      const updatedExpenses = periodData.expenses.filter(e => e.name !== expenseName || e.amount !== tx.amount);
      const prevHistory = prev.ccHistory || [];
      const updatedHistory = prevHistory.filter(h => h.id !== tx.id);

      return {
        ...prev,
        [key]: {
          ...monthData,
          [period]: {
            ...periodData,
            expenses: updatedExpenses
          }
        },
        ccHistory: updatedHistory
      };
    });
  };

  const handleBulkClearTransactions = (filteredList) => {
    if (filteredList.length === 0) return;
    const confirmText = prompt(`Are you sure you want to delete all ${filteredList.length} filtered transactions and adjust card balances? This action cannot be undone.\n\nType "WIPE" to confirm:`);
    if (confirmText !== "WIPE") return;

    // 1. Rollback card balances
    setDebts(prev => {
      return prev.map(card => {
        const txsForCard = filteredList.filter(tx => tx.cardId === card.id);
        const sumToDeduct = txsForCard.reduce((sum, tx) => sum + tx.amount, 0);
        return {
          ...card,
          balance: Math.max(0, card.balance - sumToDeduct)
        };
      });
    });

    // 2. Clear from budgets and history
    setBudgetData(prev => {
      let updatedData = { ...prev };
      
      // Group filtered transactions by month (key) and payroll period
      filteredList.forEach(tx => {
        const key = tx.date.slice(0, 7);
        const period = tx.period;
        const expenseName = `[${tx.category}] ${tx.description} (${tx.cardName})`;

        const monthData = updatedData[key];
        if (monthData) {
          const periodData = monthData[period];
          if (periodData) {
            updatedData[key] = {
              ...monthData,
              [period]: {
                ...periodData,
                expenses: periodData.expenses.filter(e => e.name !== expenseName || e.amount !== tx.amount)
              }
            };
          }
        }
      });

      // Clear from ccHistory list
      const idsToRemove = new Set(filteredList.map(tx => tx.id));
      updatedData.ccHistory = (prev.ccHistory || []).filter(tx => !idsToRemove.has(tx.id));

      return updatedData;
    });
  };

  function startEdit(d) {
    setEditData({ ...d });
    setEditing(d.id);
  }

  function saveEdit() {
    setDebts(p => p.map(x => x.id === editing ? editData : x));
    setEditing(null);
    setEditData(null);
  }

  function addNew() {
    const id = 'debt-' + Date.now();
    const newItem = { id, name: 'New Credit Account', balance: 0, limit: 10000, apr: 3.5, minPayment: 500 };
    setDebts(p => [...p, newItem]);
    startEdit(newItem);
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <MetricCard label="Total Outstanding Debt" value={peso(totalOwed)} color={C.red} sm={sm} />
        <MetricCard label="Total Credit Limit" value={peso(totalLimit)} color={C.blue} sm={sm} />
        <MetricCard label="Avg Card Utilization" value={avgUtilization.toFixed(1) + '%'} color={avgUtilization >= 50 ? C.red : avgUtilization >= 30 ? C.amber : C.green} sub="Target: <30%" sm={sm} />
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SecTitle>Debts & Credit Cards</SecTitle>
          {canWrite && <BtnG onClick={addNew}>+ Add Debt Account</BtnG>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0d1117', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: '8px', textAlign: 'left', color: C.muted }}>Account</th>
              <th style={{ padding: '8px', textAlign: 'right', color: C.muted }}>Balance (₱)</th>
              <th style={{ padding: '8px', textAlign: 'right', color: C.muted }}>Limit (₱)</th>
              <th style={{ padding: '8px', textAlign: 'right', color: C.muted }}>APR (%)</th>
              <th style={{ padding: '8px', textAlign: 'right', color: C.muted }}>Min Pay (₱)</th>
              <th style={{ padding: '8px', textAlign: 'center', color: C.muted }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {debts.map(d => {
              const util = d.limit > 0 ? (d.balance / d.limit) * 100 : 0;
              return (
                <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  {editing === d.id ? (
                    <>
                      <td style={{ padding: '6px' }}><Inp value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} disabled={readOnly}/></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.balance} onChange={e => setEditData({ ...editData, balance: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} disabled={readOnly}/></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.limit} onChange={e => setEditData({ ...editData, limit: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} disabled={readOnly}/></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.apr} onChange={e => setEditData({ ...editData, apr: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} disabled={readOnly}/></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.minPayment} onChange={e => setEditData({ ...editData, minPayment: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} disabled={readOnly}/></td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button onClick={saveEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.green, marginRight: 8, fontSize: 16 }}>✓</button>
                        <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16 }}>×</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{d.name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.red, fontWeight: 700 }}>{peso(d.balance)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.muted }}>{peso(d.limit)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{d.apr}%</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.amber }}>{peso(d.minPayment)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {canUpdate && <button onClick={() => startEdit(d)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer', color: C.muted, padding: '2px 8px', fontSize: 11, marginRight: 4 }}>Edit</button>}
                        {canUpdate && <button onClick={() => setDebts(p => p.filter(x => x.id !== d.id))} style={{ background: 'none', border: `1px solid ${C.red}33`, borderRadius: 4, cursor: 'pointer', color: C.red, padding: '2px 8px', fontSize: 11 }}>Delete</button>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      
      <Card>
        <SecTitle>Payoff Projection Calculator</SecTitle>
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Custom Monthly Payoff Budget (Total)</div>
            <Inp type="number" defaultValue={5000} id="debt-payoff-input" placeholder="₱/month" />
          </div>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: C.muted, marginBottom: 4 }}>Estimated months to payoff:</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
              {totalOwed > 0 ? Math.ceil(totalOwed / 5000) + ' Months' : 'Debt Free!'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Assuming ₱5,000 monthly total payment distributed across accounts.</div>
          </div>
        </div>
      </Card>

      {/* ══ INSTALLMENT PLAN TRACKER ════════════════════════════════════════ */}
      <Card style={{ marginBottom: 0, border: `1px solid ${C.amber}33` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showInstForm ? 14 : 0 }}>
          <div>
            <SecTitle style={{ margin: 0 }}>📦 Installment Plan Tracker</SecTitle>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Monthly CC installment obligation: <span style={{ color: C.amber, fontWeight: 700 }}>{peso(totalMonthlyInst)}/mo</span>
              {' · '}{activeInstPlans.length} active · {completedInstPlans.length} completed
            </div>
          </div>
          {canWrite && (
            <button onClick={() => {
              if (showInstForm && editingPlanId) {
                setEditingPlanId(null);
                setNewInst({ cardId: '', item: '', total: '', months: 12, startMonth: new Date().toISOString().slice(0,7), interestRate: '', customMonthly: '' });
              }
              setShowInstForm(p => !p);
            }}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.amber}55`, background: showInstForm ? `${C.amber}22` : 'transparent', color: C.amber, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
              {showInstForm ? 'Cancel' : '+ Add Plan'}
            </button>
          )}
        </div>

        {/* ── Monthly Obligations Metric Summary Bar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginTop: 12, marginBottom: 14 }}>
          <div style={{ background: `${C.card}`, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>Monthly Obligation</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.amber }}>{peso(totalMonthlyInst)}<span style={{ fontSize: 10, color: C.muted }}>/mo</span></div>
          </div>
          <div style={{ background: `${C.card}`, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>Total Paid To Date</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>{peso(totalPaidInInst)}</div>
          </div>
          <div style={{ background: `${C.card}`, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>Active Plans</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.blue }}>{activeInstPlans.length} <span style={{ fontSize: 10, color: C.muted }}>({completedInstPlans.length} done)</span></div>
          </div>
        </div>

        {/* ── Add Installment Form ── */}
        {showInstForm && (
          <div style={{ background: `${C.card2}`, borderRadius: 10, padding: 14, marginBottom: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase' }}>
              {editingPlanId ? 'Edit Installment Plan' : 'New Installment Plan'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 2fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Credit Card</label>
                <select value={newInst.cardId} onChange={e => setNewInst(p => ({ ...p, cardId: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: 'none', width: '100%' }}>
                  <option value="">Select card…</option>
                  {debts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Item Description</label>
                <Inp value={newInst.item} onChange={e => setNewInst(p => ({ ...p, item: e.target.value }))} placeholder="e.g. Lazada Shopping, Samsung TV…" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Total Principal (₱)</label>
                <Inp type="number" value={newInst.total} onChange={e => setNewInst(p => ({ ...p, total: e.target.value }))} placeholder="12000" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Terms (Months)</label>
                <Inp type="number" value={newInst.months} onChange={e => setNewInst(p => ({ ...p, months: e.target.value }))} placeholder="12" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Interest Rate (%/yr)</label>
                <Inp type="number" value={newInst.interestRate} onChange={e => setNewInst(p => ({ ...p, interestRate: e.target.value }))} placeholder="0" style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Custom Monthly Payment (₱)</label>
                <Inp type="number" value={newInst.customMonthly} onChange={e => setNewInst(p => ({ ...p, customMonthly: e.target.value }))} placeholder="Optional override" style={{ textAlign: 'right' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 4 }}>Start Month</label>
                <Inp type="month" value={newInst.startMonth} onChange={e => setNewInst(p => ({ ...p, startMonth: e.target.value }))} />
              </div>
            </div>

            {/* Live interest breakdown calculation */}
            {(() => {
              const bd = getInstallmentBreakdown(newInst.total, newInst.months, newInst.interestRate, newInst.customMonthly);
              return (newInst.total && newInst.months) ? (
                <div style={{ background: `${C.bg}`, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: C.amber, marginBottom: 6 }}>📊 Live Payment Breakdown:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>Monthly Principal: <strong style={{ color: C.text }}>{peso(bd.monthlyPrincipal)}</strong></div>
                    <div>Monthly Interest: <strong style={{ color: bd.monthlyInterest > 0 ? C.red : C.muted }}>{peso(bd.monthlyInterest)}</strong></div>
                    <div>Total Interest: <strong style={{ color: bd.totalInterest > 0 ? C.red : C.muted }}>{peso(bd.totalInterest)}</strong></div>
                    <div>Total Cost of Plan: <strong style={{ color: C.green }}>{peso(bd.totalCost)}</strong></div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13, borderTop: `1px solid ${C.border}33`, paddingTop: 6 }}>
                    Effective Monthly Outflow: <strong style={{ color: C.green, fontSize: 15 }}>{peso(bd.monthly)}/mo</strong>
                  </div>
                </div>
              ) : null;
            })()}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <BtnG onClick={addInstPlan} style={{ padding: '8px 20px', fontSize: 12 }}>
                {editingPlanId ? '💾 Save Changes' : '💾 Save Installment Plan'}
              </BtnG>
              {instSuccessMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>✓ {instSuccessMsg}</span>}
            </div>
          </div>
        )}

        {/* ── Active Plans ── */}
        {activeInstPlans.length === 0 && !showInstForm && (
          <div style={{ textAlign: 'center', color: C.muted, padding: '16px 0', fontSize: 12, marginTop: 10 }}>No active installment plans. Click "+ Add Plan" to track your CC installments.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: activeInstPlans.length > 0 ? 14 : 0 }}>
          {activeInstPlans.map(plan => {
            const bd        = getInstallmentBreakdown(plan.total, plan.months, plan.interestRate, plan.customMonthly);
            const monthly   = bd.monthly;
            const remaining = plan.months - plan.paidMonths;
            const paidAmt   = plan.paidMonths * monthly;
            const totalRepay = bd.totalCost;
            const remAmt    = totalRepay - paidAmt;
            const pct       = Math.round(plan.paidMonths / plan.months * 100);
            const planHistory = (budgetData.installmentHistory || []).filter(h => h.planId === plan.id);
            return (
              <div key={plan.id} style={{ background: `${C.card2}`, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.amber}33` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{plan.item}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      <span style={{ color: C.amber, fontWeight: 600 }}>{plan.cardName}</span>
                      {' · '}{plan.months} months @ {peso(monthly)}/mo
                      {bd.totalInterest > 0 && ` (Principal: ${peso(bd.monthlyPrincipal)}, Interest: ${peso(bd.monthlyInterest)})`}
                      {' · '}Started {plan.startMonth}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.amber }}>{peso(monthly)}<span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>/mo</span></div>
                    <div style={{ fontSize: 10, color: C.muted }}>{remaining} month{remaining !== 1 ? 's' : ''} left</div>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: `${C.border}44`, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.amber}, ${C.green})`, borderRadius: 3, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 10 }}>
                  <span>
                    {plan.paidMonths}/{plan.months} months paid · {peso(paidAmt)} paid
                    {bd.totalInterest > 0 && ` (Total Interest: ${peso(bd.totalInterest)})`}
                  </span>
                  <span style={{ color: C.orange, fontWeight: 600 }}>{peso(remAmt)} remaining</span>
                </div>
                {payingPlanId === plan.id ? (
                  <div style={{ background: `${C.card}`, borderRadius: 8, padding: 12, marginTop: 8, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.green, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>✓ Confirm Installment Payment ({peso(monthly)})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 2 }}>Deduct From Account</label>
                        <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                          style={{ padding: '6px 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 11, width: '100%', cursor: 'pointer' }}>
                          <option value="">Don't deduct (Track only)</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({peso(a.balance)})</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 2 }}>Payment Date</label>
                        <Inp type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={{ padding: '5px 8px', fontSize: 11 }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 8, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" id="payLogBudget" checked={payLogBudget} onChange={e => setPayLogBudget(e.target.checked)} style={{ cursor: 'pointer', width: 14, height: 14, accentColor: C.blue }} />
                        <label htmlFor="payLogBudget" style={{ fontSize: 11, color: C.text, cursor: 'pointer', fontWeight: 500 }}>Include in Budget</label>
                      </div>
                      {payLogBudget && (
                        <div>
                          <select value={payPeriod} onChange={e => setPayPeriod(e.target.value)}
                            style={{ padding: '6px 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 11, width: '100%', cursor: 'pointer' }}>
                            <option value="5th">5th Payroll (1st-15th)</option>
                            <option value="20th">20th Payroll (16th-31st)</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button onClick={() => confirmInstallmentPayment(plan, monthly)}
                        style={{ flex: 1, padding: '6px 12px', borderRadius: 5, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.teal})`, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Confirm Payment
                      </button>
                      <button onClick={() => setPayingPlanId(null)}
                        style={{ padding: '6px 12px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'none', color: C.muted, fontSize: 11, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canUpdate && (
                      <button onClick={() => {
                        setPayingPlanId(plan.id);
                        setPayAccountId(accounts[0]?.id || '');
                        setPayLogBudget(true);
                        setPayPeriod(new Date().getDate() <= 15 ? '5th' : '20th');
                        setPayDate(new Date().toISOString().slice(0, 10));
                      }}
                        style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.green}55`, background: `${C.green}18`, color: C.green, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        ✓ Mark 1 Month Paid ({peso(monthly)})
                      </button>
                    )}
                    <button onClick={() => setHistoryExpandedPlanId(p => p === plan.id ? null : plan.id)} title="View Payment History Logs"
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.blue}44`, background: historyExpandedPlanId === plan.id ? `${C.blue}22` : 'none', color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      📜 History ({planHistory.length})
                    </button>
                    {canUpdate && plan.paidMonths > 0 && (
                      <button onClick={() => unpayInstMonth(plan.id)} title="Undo 1 Paid Month"
                        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.amber}55`, background: `${C.amber}18`, color: C.amber, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        ↩ Unpay
                      </button>
                    )}
                    {canUpdate && (
                      <button onClick={() => handleStartEditPlan(plan)} title="Edit Plan"
                        style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.blue}33`, background: 'none', color: C.blue, cursor: 'pointer', fontSize: 11 }}>✏️</button>
                    )}
                    <button onClick={() => deleteInstPlan(plan.id)} title="Delete Plan"
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.red}33`, background: 'none', color: C.red, cursor: 'pointer', fontSize: 11 }}>🗑</button>
                  </div>
                )}

                {/* 📜 Specific Payment History Drawer */}
                {historyExpandedPlanId === plan.id && (
                  <div style={{ background: `${C.card}`, borderRadius: 8, padding: 10, marginTop: 10, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8 }}>📜 Logged Payment History for {plan.item}:</div>
                    {planHistory.length === 0 ? (
                      <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>No detailed payment transactions logged for this plan yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {planHistory.map(tx => (
                          <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}44`, fontSize: 11 }}>
                            <div>
                              <div style={{ fontWeight: 600, color: C.text }}>{tx.date} <span style={{ color: C.amber }}>({tx.period || '5th'} Payroll)</span></div>
                              <div style={{ fontSize: 10, color: C.muted }}>Account: {tx.accountName || 'No Account Deducted'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700, color: C.green }}>{peso(tx.amount)}</span>
                              {canUpdate && (
                                <button onClick={() => deleteSpecificInstallmentPayment(tx)} title="Undo & refund this specific payment"
                                  style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.red}44`, background: `${C.red}15`, color: C.red, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                                  🗑 Undo
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Completed Plans ── */}
        {completedInstPlans.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}33` }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6 }}>✅ FULLY PAID PLANS ({completedInstPlans.length})</div>
            {completedInstPlans.map(plan => {
              const planHistory = (budgetData.installmentHistory || []).filter(h => h.planId === plan.id);
              return (
                <div key={plan.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', borderRadius: 6, background: `${C.green}08`, marginBottom: 6, border: `1px solid ${C.green}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{plan.item} <span style={{ color: C.green }}>· {peso(plan.total)} fully paid</span></span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button onClick={() => setHistoryExpandedPlanId(p => p === plan.id ? null : plan.id)} title="View Payment History"
                        style={{ background: 'none', border: `1px solid ${C.blue}44`, borderRadius: 4, color: C.blue, cursor: 'pointer', fontSize: 10, padding: '2px 6px', fontWeight: 600 }}>
                        📜 History ({planHistory.length})
                      </button>
                      {canUpdate && (
                        <button onClick={() => unpayInstMonth(plan.id)} title="Unpay 1 Month"
                          style={{ background: 'none', border: `1px solid ${C.amber}44`, borderRadius: 4, color: C.amber, cursor: 'pointer', fontSize: 10, padding: '2px 6px', fontWeight: 700 }}>↩ Unpay</button>
                      )}
                      <button onClick={() => deleteInstPlan(plan.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  </div>
                  {historyExpandedPlanId === plan.id && (
                    <div style={{ background: `${C.card}`, borderRadius: 6, padding: 8, marginTop: 4, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 6 }}>📜 Logged Payment History for {plan.item}:</div>
                      {planHistory.length === 0 ? (
                        <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>No detailed payment transactions logged for this plan.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {planHistory.map(tx => (
                            <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg, padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.border}44`, fontSize: 11 }}>
                              <div>
                                <span style={{ fontWeight: 600, color: C.text }}>{tx.date}</span> <span style={{ color: C.amber }}>({tx.period || '5th'})</span>
                                <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>{tx.accountName || 'No Account'}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, color: C.green }}>{peso(tx.amount)}</span>
                                {canUpdate && (
                                  <button onClick={() => deleteSpecificInstallmentPayment(tx)} title="Undo & refund this specific payment"
                                    style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.red}44`, background: `${C.red}15`, color: C.red, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                                    🗑 Undo
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Transaction Logging Sections */}
      {debts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1.5fr', gap: 14, marginTop: 14 }}>
          {/* Log CC Transaction Form */}
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Log Credit Card Transaction</SecTitle>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Add a transaction. It will increase your card balance and automatically log it as a paid expense in your budget.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Credit Card / Debt Account</label>
                <select 
                  value={selectedCardId} 
                  onChange={e => setSelectedCardId(e.target.value)} 
                  disabled={readOnly}
                  style={{
                    padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                    background: C.bg, color: C.text, fontSize: 13, outline: 'none',
                    fontFamily: 'inherit', width: '100%', cursor: 'pointer'
                  }}
                >
                  <option value="" disabled>Select Card</option>
                  {debts.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Bal: {peso(d.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category</label>
                  <select 
                    value={ccCategory} 
                    onChange={e => setCcCategory(e.target.value)} 
                    disabled={readOnly}
                    style={{
                      padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                      background: C.bg, color: C.text, fontSize: 13, outline: 'none',
                      fontFamily: 'inherit', width: '100%', cursor: 'pointer'
                    }}
                  >
                    {['Food', 'Grocery', 'Utilities', 'Shopping', 'Travel', 'Entertainment', 'Health', 'Others'].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Amount (₱)</label>
                  <Inp 
                    type="number" 
                    value={ccAmount} 
                    onChange={e => setCcAmount(e.target.value)} 
                    placeholder="0" 
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                <Inp 
                  type="text" 
                  value={ccDesc} 
                  onChange={e => setCcDesc(e.target.value)} 
                  placeholder="e.g. Starbucks, Grocery shopping" 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                  <Inp 
                    type="date" 
                    value={ccDate} 
                    onChange={e => handleCcDateChange(e.target.value)} 
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Payroll Period</label>
                  <select 
                    value={ccPeriod} 
                    onChange={e => setCcPeriod(e.target.value)} 
                    disabled={readOnly}
                    style={{
                      padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                      background: C.bg, color: C.text, fontSize: 13, outline: 'none',
                      fontFamily: 'inherit', width: '100%', cursor: 'pointer'
                    }}
                  >
                    <option value="5th">5th Payroll (1st half of month)</option>
                    <option value="20th">20th Payroll (2nd half of month)</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {canWrite && (
                <BtnG onClick={handleCCTransaction} style={{ padding: '7px 14px', fontSize: 12, background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`, color: '#fff', border: 'none' }}>
                  Add Transaction
                </BtnG>
              )}
              {ccSuccessMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{ccSuccessMsg}</span>}
            </div>
          </Card>

          {/* CC Transaction History Log */}
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
              <SecTitle style={{ margin: 0 }}>CC Transactions Ledger</SecTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: C.muted }}>Filter:</span>
                <input 
                  type="date" 
                  value={ccFilterDate} 
                  onChange={e => setCcFilterDate(e.target.value)} 
                  style={{
                    padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.border}`,
                    background: C.bg, color: C.text, fontSize: 11, outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
                {ccFilterDate && (
                  <button 
                    onClick={() => setCcFilterDate('')}
                    style={{
                      background: 'none', border: `1px solid ${C.border}`, borderRadius: 4,
                      color: C.muted, padding: '4px 8px', fontSize: 11, cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {(!budgetData.ccHistory || budgetData.ccHistory.length === 0) ? (
              <div style={{ color: C.muted, fontSize: 12, padding: '10px 0', textAlign: 'center' }}>No card transactions logged yet.</div>
            ) : (() => {
              const filteredTxs = ccFilterDate 
                ? budgetData.ccHistory.filter(t => t.date === ccFilterDate)
                : budgetData.ccHistory;

              if (filteredTxs.length === 0) {
                return (
                  <div>
                    <div style={{ color: C.muted, fontSize: 12, padding: '10px 0', textAlign: 'center' }}>No transactions on this date.</div>
                  </div>
                );
              }

              return (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    {canUpdate && (
                      <button 
                        onClick={() => handleBulkClearTransactions(filteredTxs)}
                        style={{
                          background: 'none', border: `1px solid ${C.red}66`, borderRadius: 6,
                          color: C.red, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        🗑 Clear Filtered ({filteredTxs.length})
                      </button>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                        <th style={{ textAlign: 'left', padding: '6px' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '6px' }}>Category</th>
                        <th style={{ textAlign: 'left', padding: '6px' }}>Description</th>
                        <th style={{ textAlign: 'left', padding: '6px' }}>Account</th>
                        <th style={{ textAlign: 'right', padding: '6px' }}>Amount</th>
                        <th style={{ textAlign: 'center', padding: '6px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTxs.map(tx => (
                        <tr key={tx.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                          {editingTxId === tx.id ? (
                            <>
                              <td style={{ padding: '4px' }}>
                                <Inp 
                                  type="date" 
                                  value={editTxData.date} 
                                  onChange={e => handleEditTxDateChange(e.target.value)} 
                                  disabled={readOnly}
                                  style={{ padding: '4px 6px', fontSize: 11 }}
                                />
                              </td>
                              <td style={{ padding: '4px' }}>
                                <select 
                                  value={editTxData.category} 
                                  onChange={e => setEditTxData({ ...editTxData, category: e.target.value })} 
                                  disabled={readOnly}
                                  style={{
                                    padding: '4px 6px', borderRadius: 4, border: `1px solid ${C.border}`,
                                    background: C.bg, color: C.text, fontSize: 11, outline: 'none',
                                    fontFamily: 'inherit', cursor: 'pointer', width: '100%'
                                  }}
                                >
                                  {['Food', 'Grocery', 'Utilities', 'Shopping', 'Travel', 'Entertainment', 'Health', 'Others'].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '4px' }}>
                                <Inp 
                                  value={editTxData.description} 
                                  onChange={e => setEditTxData({ ...editTxData, description: e.target.value })} 
                                  disabled={readOnly}
                                  style={{ padding: '4px 6px', fontSize: 11 }}
                                />
                              </td>
                              <td style={{ padding: '4px' }}>
                                <select 
                                  value={editTxData.cardId} 
                                  onChange={e => setEditTxData({ ...editTxData, cardId: e.target.value })} 
                                  disabled={readOnly}
                                  style={{
                                    padding: '4px 6px', borderRadius: 4, border: `1px solid ${C.border}`,
                                    background: C.bg, color: C.text, fontSize: 11, outline: 'none',
                                    fontFamily: 'inherit', cursor: 'pointer', width: '100%'
                                  }}
                                >
                                  {debts.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '4px' }}>
                                <Inp 
                                  type="number" 
                                  value={editTxData.amount} 
                                  onChange={e => setEditTxData({ ...editTxData, amount: Number(e.target.value) || 0 })} 
                                  disabled={readOnly}
                                  style={{ textAlign: 'right', padding: '4px 6px', fontSize: 11 }}
                                />
                              </td>
                              <td style={{ padding: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <button onClick={saveEditTx} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.green, marginRight: 8, fontSize: 14 }}>✓</button>
                                <button onClick={cancelEditTx} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14 }}>×</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{tx.date}</td>
                              <td style={{ padding: '8px 6px' }}>
                                <span style={{ 
                                  padding: '2px 6px', borderRadius: 4, 
                                  fontSize: 10, fontWeight: 700, 
                                  color: '#fff', background: CAT_COLORS[tx.category || 'Others'] || '#7d8590'
                                }}>
                                  {tx.category || 'Others'}
                                </span>
                              </td>
                              <td style={{ padding: '8px 6px', fontWeight: 600 }}>{tx.description}</td>
                              <td style={{ padding: '8px 6px', color: C.muted }}>{tx.cardName}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: C.red }}>{peso(tx.amount)}</td>
                              <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {canUpdate && (
                                  <button 
                                    onClick={() => startEditTx(tx)}
                                    style={{ 
                                      background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, 
                                      color: C.muted, padding: '2px 6px', cursor: 'pointer', fontSize: 10, marginRight: 4
                                    }}
                                  >
                                    Edit
                                  </button>
                                )}
                                {canUpdate && (
                                  <button 
                                    onClick={() => handleDeleteCCTransaction(tx)}
                                    style={{ 
                                      background: 'none', border: `1px solid ${C.red}33`, borderRadius: 4, 
                                      color: C.red, padding: '2px 6px', cursor: 'pointer', fontSize: 10
                                    }}
                                    title="Delete & Deduct balance"
                                  >
                                    🗑
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </Card>
        </div>
      )}
    </div>
  );
}








// ─── FINANCIAL KNOWLEDGE GRAPH (ENGRAPHIS INSPIRED) ───────────────────────────
function FinancialGraphTab({ budgetData = {}, accounts = [], debts = [], majorExpenses = [], credits = [], sm }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const draggingNodeRef = useRef(null); // Ref to avoid React state closure stale references during mousemove
  const alphaRef = useRef(1.0);

  const [graphYear, setGraphYear] = useState(CUR_YEAR);
  const [graphMonth, setGraphMonth] = useState(CUR_MONTH);

  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [nodeSizeScale, setNodeSizeScale] = useState(1);
  const [repelForce, setRepelForce] = useState(55);
  const [labelDensity, setLabelDensity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);

  // Zoom & Viewport Matrix State
  const [zoomScale, setZoomScale] = useState(1.0);

  const selectedKey = makeKey(graphYear, graphMonth);
  const monthData = budgetData[selectedKey] || { expenses: [] };
  const monthlyExpenses = monthData.expenses || [];

  // Initialize & Persist Node Positions across renders
  useEffect(() => {
    const totalNetWorth = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const existing = new Map(nodesRef.current.map(n => [n.id, n]));

    const list = [];
    const cx = 400, cy = 320;

    // 1. Core Hub
    const oldCore = existing.get('core-user');
    list.push({
      id: 'core-user', label: '👤 User Financial Hub', type: 'core',
      val: totalNetWorth || 100000, color: '#7257ff',
      x: oldCore ? oldCore.x : cx, y: oldCore ? oldCore.y : cy,
      vx: 0, vy: 0
    });

    // 2. Accounts
    accounts.forEach((acc, i) => {
      const id = `acc-${acc.id}`;
      const old = existing.get(id);
      const angle = (i / Math.max(accounts.length, 1)) * Math.PI * 2;
      list.push({
        id, label: `🏦 ${acc.name}`, sub: acc.type, type: 'account',
        val: Math.max(acc.balance || 0, 5000), color: TYPE_CLR[acc.type] || C.blue,
        x: old ? old.x : cx + Math.cos(angle) * 140,
        y: old ? old.y : cy + Math.sin(angle) * 140,
        vx: 0, vy: 0, amount: acc.balance || 0
      });
    });

    // 3. Expense Categories
    const categories = ['Fixed', 'Variable', 'Debt', 'Investment'];
    const catColors = { Fixed: C.red, Variable: C.orange, Debt: C.amber, Investment: C.purple };
    categories.forEach((cat, i) => {
      const id = `cat-${cat}`;
      const old = existing.get(id);
      const angle = (i / categories.length) * Math.PI * 2 + 0.5;
      list.push({
        id, label: `💸 ${cat} Category`, sub: 'Category Hub', type: 'expense',
        val: 20000, color: catColors[cat] || C.orange,
        x: old ? old.x : cx + Math.cos(angle) * 220,
        y: old ? old.y : cy + Math.sin(angle) * 220,
        vx: 0, vy: 0
      });
    });

    // 4. Itemized Monthly Expenses for Selected Month
    monthlyExpenses.forEach((exp, i) => {
      const id = `mexp-${exp.id || i}`;
      const old = existing.get(id);
      const parentCat = exp.category || 'Variable';
      const catAngleIdx = categories.indexOf(parentCat);
      const baseAngle = (catAngleIdx >= 0 ? catAngleIdx : 1) * (Math.PI / 2);
      const angle = baseAngle + (i * 0.4);

      list.push({
        id,
        label: `📌 ${exp.description || 'Expense'}`,
        sub: `₱${(exp.amount || 0).toLocaleString()} (${exp.period || 'Monthly'})`,
        type: 'monthly_item',
        category: parentCat,
        val: Math.max(exp.amount || 0, 1500),
        color: catColors[parentCat] || C.orange,
        x: old ? old.x : cx + Math.cos(angle) * 280,
        y: old ? old.y : cy + Math.sin(angle) * 280,
        vx: 0, vy: 0,
        amount: exp.amount || 0
      });
    });

    // 5. Credit Cards / Debts
    debts.forEach((d, i) => {
      const id = `debt-${d.id}`;
      const old = existing.get(id);
      const angle = (i / Math.max(debts.length, 1)) * Math.PI * 2 + 1.2;
      list.push({
        id, label: `💳 ${d.name}`, sub: `Bal: ₱${(d.balance || 0).toLocaleString()}`, type: 'debt',
        val: Math.max(d.balance || 0, 8000), color: C.red,
        x: old ? old.x : cx + Math.cos(angle) * 180,
        y: old ? old.y : cy + Math.sin(angle) * 180,
        vx: 0, vy: 0, amount: d.balance || 0
      });
    });

    // 6. Goals / Major Expenses
    majorExpenses.forEach((m, i) => {
      const id = `goal-${m.id}`;
      const old = existing.get(id);
      const angle = (i / Math.max(majorExpenses.length, 1)) * Math.PI * 2 + 2.1;
      list.push({
        id, label: `🎯 ${m.name}`, sub: `Target: ₱${(m.budget || 0).toLocaleString()}`, type: 'goal',
        val: Math.max(m.budget || 0, 10000), color: C.amber,
        x: old ? old.x : cx + Math.cos(angle) * 240,
        y: old ? old.y : cy + Math.sin(angle) * 240,
        vx: 0, vy: 0, amount: m.actual || 0
      });
    });

    nodesRef.current = list;
    alphaRef.current = 1.0;
  }, [accounts, debts, majorExpenses, monthlyExpenses, graphYear, graphMonth]);

  // Edges connecting graph hubs
  const links = useMemo(() => {
    const edges = [];
    const nodes = nodesRef.current;
    nodes.forEach(n => {
      if (n.type === 'account' || n.type === 'debt' || n.type === 'expense') {
        edges.push({ source: 'core-user', target: n.id });
      }
      if (n.type === 'monthly_item') {
        const parentCatId = `cat-${n.category}`;
        const parentNode = nodes.find(c => c.id === parentCatId);
        edges.push({ source: parentNode ? parentNode.id : 'core-user', target: n.id });
      }
      if (n.type === 'goal') {
        const sav = nodes.find(a => a.sub === 'Savings' || a.sub === 'Investment');
        edges.push({ source: sav ? sav.id : 'core-user', target: n.id });
      }
    });
    return edges;
  }, [nodesRef.current.length]);

  // Mouse Wheel Zoom Handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoomScale(prev => Math.max(0.3, Math.min(3.0, prev * zoomFactor)));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Global Mouse Up & Move listeners to catch fast drags
  useEffect(() => {
    const onGlobalMouseMove = (e) => {
      if (!draggingNodeRef.current || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const rawX = (e.clientX - rect.left) * scaleX;
      const rawY = (e.clientY - rect.top) * scaleY;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const mx = (rawX - centerX) / zoomScale + centerX;
      const my = (rawY - centerY) / zoomScale + centerY;

      draggingNodeRef.current.x = mx;
      draggingNodeRef.current.y = my;
      draggingNodeRef.current.vx = 0;
      draggingNodeRef.current.vy = 0;
      alphaRef.current = 0.4;
    };

    const onGlobalMouseUp = () => {
      if (draggingNodeRef.current) {
        draggingNodeRef.current.isDragging = false;
        draggingNodeRef.current = null;
      }
    };

    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
    };
  }, [zoomScale]);

  // Re-warm physics when controls change
  useEffect(() => {
    alphaRef.current = 0.4;
  }, [filterType, repelForce, nodeSizeScale, graphYear, graphMonth]);

  // Canvas Physics & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const width = canvas.width = canvas.parentElement.clientWidth || 800;
    const height = canvas.height = 650;
    const centerX = width / 2;
    const centerY = height / 2;

    let particles = Array.from({ length: 25 }, () => ({
      linkIndex: Math.floor(Math.random() * Math.max(links.length, 1)),
      progress: Math.random(),
      speed: 0.003 + Math.random() * 0.004
    }));

    function step() {
      const nodes = nodesRef.current;
      const alpha = alphaRef.current;

      if (alpha > 0.005) {
        // 1. Center Gravity
        nodes.forEach(n => {
          if (n.isDragging) return;
          const dx = centerX - n.x;
          const dy = centerY - n.y;
          n.vx += dx * 0.004 * alpha;
          n.vy += dy * 0.004 * alpha;
        });

        // 2. Repulsion
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const targetDist = repelForce * 1.4;
            if (dist < targetDist) {
              const force = (targetDist - dist) / dist * 0.02 * alpha;
              if (!a.isDragging) { a.vx -= dx * force; a.vy -= dy * force; }
              if (!b.isDragging) { b.vx += dx * force; b.vy += dy * force; }
            }
          }
        }

        // 3. Link Attraction
        links.forEach(l => {
          const s = nodes.find(n => n.id === l.source);
          const t = nodes.find(n => n.id === l.target);
          if (s && t) {
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (dist - 120) * 0.003 * alpha;
            if (!s.isDragging) { s.vx += dx * force; s.vy += dy * force; }
            if (!t.isDragging) { t.vx -= dx * force; t.vy -= dy * force; }
          }
        });

        // 4. Friction (0.50)
        nodes.forEach(n => {
          if (n.isDragging) return;
          n.vx *= 0.50;
          n.vy *= 0.50;
          n.x += n.vx;
          n.y += n.vy;

          n.x = Math.max(70, Math.min(width - 70, n.x));
          n.y = Math.max(70, Math.min(height - 70, n.y));
        });

        alphaRef.current *= 0.94;
      } else {
        nodes.forEach(n => { n.vx = 0; n.vy = 0; });
      }

      ctx.clearRect(0, 0, width, height);

      // Save transform and apply Zoom around center
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(zoomScale, zoomScale);
      ctx.translate(-centerX, -centerY);

      // Render Grid
      ctx.strokeStyle = 'rgba(28, 43, 66, 0.2)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

      // Render Edges
      links.forEach(l => {
        const s = nodes.find(n => n.id === l.source);
        const t = nodes.find(n => n.id === l.target);
        if (s && t) {
          const isSelected = selectedNode && (selectedNode.id === s.id || selectedNode.id === t.id);
          const isFiltered = filterType === 'all' || s.type === filterType || t.type === filterType || s.type === 'core';

          ctx.strokeStyle = isSelected ? '#30d6b0' : isFiltered ? 'rgba(75, 141, 255, 0.35)' : 'rgba(75, 141, 255, 0.08)';
          ctx.lineWidth = isSelected ? 2.5 : 1.2;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
        }
      });

      // Flowing Particles
      particles.forEach(p => {
        if (links.length === 0) return;
        const link = links[p.linkIndex % links.length];
        if (link) {
          const s = nodes.find(n => n.id === link.source);
          const t = nodes.find(n => n.id === link.target);
          if (s && t) {
            p.progress += p.speed;
            if (p.progress > 1) p.progress = 0;
            const px = s.x + (t.x - s.x) * p.progress;
            const py = s.y + (t.y - s.y) * p.progress;
            ctx.fillStyle = '#30d6b0';
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // Render Nodes
      nodes.forEach(n => {
        const isSelected = selectedNode?.id === n.id;
        const isHovered = hoveredNode?.id === n.id;
        const isMatchingSearch = searchTerm && n.label.toLowerCase().includes(searchTerm.toLowerCase());
        const isFiltered = filterType === 'all' || n.type === filterType || n.type === 'core';

        const alphaOpacity = isFiltered ? 1 : 0.2;
        const baseRadius = (n.type === 'core' ? 24 : 10 + Math.log10(Math.max(n.val, 100)) * 2.2) * nodeSizeScale;

        ctx.globalAlpha = alphaOpacity;

        // Outer Glow Ring
        ctx.fillStyle = isSelected ? `${n.color}55` : isHovered ? `${n.color}44` : `${n.color}22`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseRadius + 6, 0, Math.PI * 2);
        ctx.fill();

        // Main Node Circle
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected || isMatchingSearch) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Draw Labels
        const showLabel = labelDensity === 'all' || (labelDensity === 'hubs' && (n.type === 'core' || baseRadius > 18)) || (labelDensity === 'hover' && (isSelected || isHovered));
        if (showLabel && isFiltered) {
          ctx.font = `${n.type === 'core' ? '700 12px' : '600 11px'} Inter, sans-serif`;
          const textWidth = ctx.measureText(n.label).width;
          const labelY = n.y + baseRadius + 14;

          ctx.fillStyle = 'rgba(7, 17, 31, 0.85)';
          ctx.fillRect(n.x - textWidth / 2 - 6, labelY - 11, textWidth + 12, 16);
          ctx.strokeStyle = `${C.border}66`;
          ctx.lineWidth = 1;
          ctx.strokeRect(n.x - textWidth / 2 - 6, labelY - 11, textWidth + 12, 16);

          ctx.fillStyle = isSelected ? '#ffffff' : C.text;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, labelY);
        }

        ctx.globalAlpha = 1;
      });

      ctx.restore();

      animId = requestAnimationFrame(step);
    }

    step();
    return () => cancelAnimationFrame(animId);
  }, [links, selectedNode, hoveredNode, filterType, nodeSizeScale, repelForce, labelDensity, searchTerm, zoomScale]);

  // Helper to convert Mouse Event coordinates to Zoomed Canvas Node Coordinates
  const getCanvasMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { mx: 0, my: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const rawX = (e.clientX - rect.left) * scaleX;
    const rawY = (e.clientY - rect.top) * scaleY;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const mx = (rawX - centerX) / zoomScale + centerX;
    const my = (rawY - centerY) / zoomScale + centerY;

    return { mx, my };
  };

  // Canvas Mouse Down Handler with Ref Lock
  const handleMouseDown = (e) => {
    const { mx, my } = getCanvasMousePos(e);

    const target = nodesRef.current.find(n => {
      const baseRadius = (n.type === 'core' ? 24 : 10 + Math.log10(Math.max(n.val, 100)) * 2.2) * nodeSizeScale;
      const hitRadius = baseRadius + 18;
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) <= hitRadius;
    });

    if (target) {
      target.isDragging = true;
      draggingNodeRef.current = target;
      setSelectedNode(target);
      alphaRef.current = 0.4;
    } else {
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e) => {
    const { mx, my } = getCanvasMousePos(e);

    if (draggingNodeRef.current) {
      draggingNodeRef.current.x = mx;
      draggingNodeRef.current.y = my;
      draggingNodeRef.current.vx = 0;
      draggingNodeRef.current.vy = 0;
      alphaRef.current = 0.4;
    } else {
      const hover = nodesRef.current.find(n => {
        const baseRadius = (n.type === 'core' ? 24 : 10 + Math.log10(Math.max(n.val, 100)) * 2.2) * nodeSizeScale;
        const hitRadius = baseRadius + 18;
        const dx = n.x - mx, dy = n.y - my;
        return Math.sqrt(dx * dx + dy * dy) <= hitRadius;
      });
      setHoveredNode(hover || null);
      if (canvasRef.current) canvasRef.current.style.cursor = hover ? 'pointer' : 'default';
    }
  };

  const totalMonthlyOutflow = monthlyExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div>
      {/* ── Top Header with Month/Year Picker ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>🕸 Financial Knowledge Graph</div>
          <div style={{ fontSize: 12, color: C.muted }}>Interactive force-directed graph of accounts, categories, monthly expenses, credit cards, and goals.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Month / Year Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>📅 Month:</span>
            <select value={graphMonth} onChange={e => setGraphMonth(Number(e.target.value))}
              style={{ background: 'none', border: 'none', color: C.text, fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
              {MONTH_NAMES.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
            </select>
            <select value={graphYear} onChange={e => setGraphYear(Number(e.target.value))}
              style={{ background: 'none', border: 'none', color: C.text, fontSize: 12, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
              {[CUR_YEAR - 2, CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <Inp type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="🔍 Find node in graph…" style={{ width: 170, padding: '6px 10px', fontSize: 12 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '260px 1fr 280px', gap: 14 }}>
        {/* ── Left Controls Sidebar ── */}
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>🎛 Graph Controls</SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Filter Node Types</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  ['all', '🔀 All Entities', C.blue],
                  ['account', '🏦 Accounts', C.green],
                  ['expense', '💸 Category Hubs', C.purple],
                  ['monthly_item', '📌 Monthly Expenses', C.orange],
                  ['debt', '💳 Credit Cards', C.red],
                  ['goal', '🎯 Savings Goals', C.amber],
                ].map(([val, label, color]) => (
                  <button key={val} onClick={() => setFilterType(val)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${filterType === val ? color : C.border}`, background: filterType === val ? `${color}22` : 'transparent', color: filterType === val ? color : C.muted, cursor: 'pointer', fontSize: 11, fontWeight: filterType === val ? 700 : 400, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    {filterType === val && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            <div style={{ background: C.card2, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{MONTH_NAMES[graphMonth]} {graphYear} Outflow</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.red }}>{peso(totalMonthlyOutflow)}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{monthlyExpenses.length} itemized outflow nodes</div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Node Size Scale ({nodeSizeScale.toFixed(1)}x)</label>
              <input type="range" min="0.5" max="2.5" step="0.1" value={nodeSizeScale} onChange={e => setNodeSizeScale(Number(e.target.value))} style={{ width: '100%', accentColor: C.purple }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Cluster Repel Force ({repelForce})</label>
              <input type="range" min="20" max="150" step="5" value={repelForce} onChange={e => setRepelForce(Number(e.target.value))} style={{ width: '100%', accentColor: C.teal }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Label Display Density</label>
              <select value={labelDensity} onChange={e => setLabelDensity(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: 'none', width: '100%' }}>
                <option value="all">Show All Labels</option>
                <option value="hubs">Major Hubs Only</option>
                <option value="hover">Hover / Select Only</option>
              </select>
            </div>
          </div>
        </Card>

        {/* ── Center Canvas Graph ── */}
        <Card style={{ marginBottom: 0, padding: 0, overflow: 'hidden', position: 'relative', background: '#040b17', border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            style={{ display: 'block', width: '100%', height: 650 }}
          />

          {/* Zoom Overlay Quick Controls */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4, background: 'rgba(7,17,31,0.85)', padding: '4px', borderRadius: 6, border: `1px solid ${C.border}` }}>
            <button onClick={() => setZoomScale(p => Math.min(3.0, p * 1.2))} title="Zoom In"
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>🔍 +</button>
            <button onClick={() => setZoomScale(p => Math.max(0.3, p / 1.2))} title="Zoom Out"
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>🔍 −</button>
            <button onClick={() => setZoomScale(1.0)} title="Reset View"
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>↺ 100%</button>
          </div>

          <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 10, color: C.muted, background: 'rgba(7,17,31,0.85)', padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}` }}>
            💡 Scroll mouse wheel to Zoom In/Out • Click & drag any node circle • Zoom: {Math.round(zoomScale * 100)}%
          </div>
        </Card>

        {/* ── Right Inspection Drawer ── */}
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>🔍 Node Inspector</SecTitle>
          {!selectedNode ? (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '40px 0', lineHeight: 1.6 }}>
              👈 Click or drag any node on the graph to inspect its connected accounts, volume, and details.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: `${selectedNode.color}22`, border: `1px solid ${selectedNode.color}44` }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: selectedNode.color }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{selectedNode.label}</div>
                  <div style={{ fontSize: 10, color: selectedNode.color, fontWeight: 700, textTransform: 'uppercase' }}>{selectedNode.type.replace('_', ' ')} Node</div>
                </div>
              </div>

              {selectedNode.amount !== undefined && (
                <div style={{ background: C.card2, borderRadius: 8, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Value / Amount</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{peso(selectedNode.amount)}</div>
                </div>
              )}

              <div>
                <SecTitle style={{ fontSize: 10 }}>Connected Network Edges</SecTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).map((l, idx) => {
                    const otherId = l.source === selectedNode.id ? l.target : l.source;
                    const otherNode = nodesRef.current.find(n => n.id === otherId);
                    if (!otherNode) return null;
                    return (
                      <div key={idx} style={{ padding: '6px 10px', borderRadius: 6, background: `${C.panel}88`, border: `1px solid ${C.border}44`, fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{otherNode.label}</span>
                        <span style={{ fontSize: 10, color: C.muted }}>→ link</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={() => setSelectedNode(null)}
                style={{ marginTop: 10, padding: '7px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.muted, cursor: 'pointer', fontSize: 11 }}>
                Close Inspection Drawer
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}


// ─── FINANCIAL CALENDAR ───────────────────────────────────────────────────────
function CalendarTab({ budgetData, sm }) {
  const [year, setYear] = useState(CUR_YEAR);
  const [month, setMonth] = useState(CUR_MONTH);

  const key = makeKey(year, month);
  const md = budgetData[key];
  const p5 = md?.['5th']?.expenses || [];
  const p20 = md?.['20th']?.expenses || [];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  const getDayEvents = (d) => {
    const events = [];
    if (d === 5) {
      events.push({ type: 'payroll', label: 'Payroll 5th' });
      p5.forEach(e => {
        if (e.amount > 0) events.push({ type: 'bill', label: e.name, amount: e.amount, done: e.done });
      });
    }
    if (d === 20) {
      events.push({ type: 'payroll', label: 'Payroll 20th' });
      p20.forEach(e => {
        if (e.amount > 0) events.push({ type: 'bill', label: e.name, amount: e.amount, done: e.done });
      });
    }
    return events;
  };

  return (
    <div>
      <YMPicker year={year} monthIdx={month} onYear={setYear} onMonth={setMonth} sm={sm} />
      <Card>
        <SecTitle>Financial Calendar for {MONTH_NAMES[month]} {year}</SecTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 600, fontSize: 11, color: C.muted, marginBottom: 8 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {calendarDays.map((d, idx) => {
            if (d === null) return <div key={`empty-${idx}`} style={{ minHeight: sm ? 50 : 80, background: 'transparent' }} />;
            const events = getDayEvents(d);
            const isToday = year === CUR_YEAR && month === CUR_MONTH && d === NOW.getDate();
            const hasPayroll = events.some(e => e.type === 'payroll');
            const hasUnpaidBills = events.some(e => e.type === 'bill' && !e.done);

            return (
              <div key={d} style={{
                minHeight: sm ? 50 : 80,
                background: isToday ? 'rgba(56,139,253,0.1)' : C.border + '33',
                border: `1px solid ${isToday ? C.blue : hasPayroll ? C.green + '44' : hasUnpaidBills ? C.red + '44' : C.border + '44'}`,
                borderRadius: 6,
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? C.blue : C.text }}>{d}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                  {events.slice(0, 3).map((e, idx) => (
                    <div key={idx} style={{
                      fontSize: 8,
                      padding: '1px 3px',
                      borderRadius: 3,
                      background: e.type === 'payroll' ? C.green + '22' : e.done ? C.muted + '22' : C.red + '22',
                      color: e.type === 'payroll' ? C.green : e.done ? C.muted : C.red,
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      textDecoration: e.done ? 'line-through' : 'none'
                    }}>
                      {e.label}
                    </div>
                  ))}
                  {events.length > 3 && <div style={{ fontSize: 8, color: C.muted }}>+{events.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── REPORT DASHBOARD ─────────────────────────────────────────────────────────
function ReportTab({ budgetData, accounts, majorExpenses, credits, debts = DEF_DEBTS, balanceHistory, sm, session }) {
  const [reportRange, setReportRange] = useState('current');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const reportRef = useRef(null);

  const toggleSection = (id) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Compute all report data ──
  const curKey = makeKey(CUR_YEAR, CUR_MONTH);

  const getReportKeys = () => {
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
      for (let m = 0; m <= CUR_MONTH; m++) {
        res.push(makeKey(CUR_YEAR, m));
      }
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
  };

  const keys = getReportKeys();
  const stats = keys.map(key => {
    const md = budgetData[key] || (key === curKey ? makeMonthData() : null);
    let fixed = 0, variable = 0, debt = 0, investment = 0;
    if (md) {
      ['5th', '20th'].forEach(p => {
        if (md[p]) {
          md[p].expenses.forEach(e => {
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
    const mt = md ? calcMonth(md) : { income: 0, expenses: 0, savings: 0, otIncome: 0, otHours: 0, savingsRate: 0 };
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
  const totalBal = accounts.reduce((s, a) => s + a.balance, 0);
  const totalCredits = credits.filter(c => !c.done).reduce((s, c) => s + c.amount, 0);
  const totalDebts = debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = totalBal + totalCredits - totalDebts;
  const liquid = accounts.filter(a => ['Savings', 'Checking', 'Digital'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
  const avgExp = active.length ? active.reduce((s, m) => s + m.expenses, 0) / active.length : 0;
  const safetyMonths = avgExp > 0 ? liquid / avgExp : 0;

  // Health score (same algo as Dashboard)
  const debtRatio = totalIncome > 0 ? (totalDebtPayments / totalIncome) * 100 : 0;
  const getHealthScore = () => {
    let score = 0;
    if (avgRate >= 30) score += 30; else if (avgRate >= 20) score += 20; else if (avgRate >= 10) score += 10;
    if (safetyMonths >= 6) score += 30; else if (safetyMonths >= 3) score += 20; else if (safetyMonths >= 1) score += 10;
    if (debtRatio <= 15) score += 25; else if (debtRatio <= 30) score += 15; else if (debtRatio <= 45) score += 5;
    const overspentCount = majorExpenses.filter(e => e.actual > e.budget).length;
    if (overspentCount === 0) score += 15; else if (overspentCount <= 2) score += 5;
    return score;
  };
  const healthScore = getHealthScore();
  const getGrade = (s) => {
    if (s >= 90) return { label: 'Excellent', color: C.green, emoji: '🟢' };
    if (s >= 70) return { label: 'Good', color: C.blue, emoji: '🔵' };
    if (s >= 50) return { label: 'Warning', color: C.amber, emoji: '🟡' };
    return { label: 'Critical', color: C.red, emoji: '🔴' };
  };
  const grade = getGrade(healthScore);

  // Budget vs actual
  const getBudgetVsActual = () => {
    const grouped = {};
    keys.forEach(key => {
      const md = budgetData[key];
      if (md) {
        ['5th', '20th'].forEach(p => {
          if (md[p]) {
            md[p].expenses.forEach(e => {
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
    return Object.values(grouped).sort((a, b) => b.budget - a.budget);
  };
  const bvsA = getBudgetVsActual();

  // Insights
  const getInsights = () => {
    const list = [];
    if (avgRate >= 30) list.push({ text: `Savings rate is excellent at ${Math.round(avgRate)}%.`, type: 'good' });
    else if (avgRate < 10) list.push({ text: `Savings rate is low at ${Math.round(avgRate)}%. Consider cutting variable expenses.`, type: 'warn' });
    else list.push({ text: `Savings rate is healthy at ${Math.round(avgRate)}%.`, type: 'info' });
    if (safetyMonths >= 6) list.push({ text: 'Emergency fund is fully funded (6+ months of runway).', type: 'good' });
    else if (safetyMonths < 3) list.push({ text: `Emergency fund covers only ${safetyMonths.toFixed(1)} months. Aim for 3-6 months.`, type: 'warn' });
    if (debtRatio > 35) list.push({ text: `Debt payments consuming ${debtRatio.toFixed(1)}% of income — high risk.`, type: 'warn' });
    else list.push({ text: `Debt-to-income ratio is healthy at ${debtRatio.toFixed(1)}%.`, type: 'good' });
    if (totalSavings > 0) list.push({ text: `Net savings for this period: ${peso(totalSavings)}.`, type: 'info' });
    const overBudgetItems = bvsA.filter(b => b.actual > b.budget && b.budget > 0);
    if (overBudgetItems.length > 0) {
      list.push({ text: `${overBudgetItems.length} expense(s) over budget: ${overBudgetItems.map(b => b.name).join(', ')}.`, type: 'warn' });
    }
    return list;
  };
  const insights = getInsights();

  // Category breakdown for accounts
  const accountsByType = {};
  accounts.forEach(a => {
    if (!accountsByType[a.type]) accountsByType[a.type] = [];
    accountsByType[a.type].push(a);
  });

  const reportDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const rangeLabel = reportRange === 'current' ? `${displayKey(curKey)}` :
                     reportRange === '3m' ? `${displayKey(keys[0])} – ${displayKey(keys[keys.length - 1])}` :
                     reportRange === 'ytd' ? `Jan ${CUR_YEAR} – ${displayKey(curKey)}` :
                     `${displayKey(keys[0])} – ${displayKey(keys[keys.length - 1])}`;

  // ── Generate HTML email ──
  const generateEmailHTML = () => {
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
        <td style="padding:8px 12px;text-align:right;font-weight:700;">₱${a.balance.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const debtRows = debts.map(d => {
      return `<tr style="border-bottom:1px solid #1c2b4222;">
        <td style="padding:8px 12px;font-weight:600;">${d.name}</td>
        <td style="padding:8px 12px;text-align:right;color:#ff514f;font-weight:700;">₱${d.balance.toLocaleString()}</td>
        <td style="padding:8px 12px;text-align:right;">₱${d.limit.toLocaleString()}</td>
        <td style="padding:8px 12px;text-align:right;">${d.apr}%</td>
      </tr>`;
    }).join('');

    const goalRows = majorExpenses.map(e => {
      const pct = e.budget > 0 ? (e.actual / e.budget) * 100 : 0;
      const barWidth = Math.min(pct, 100);
      const barColor = e.done ? '#24d17e' : '#4b8dff';
      return `<tr style="border-bottom:1px solid #1c2b4222;">
        <td style="padding:8px 12px;font-weight:600;">${e.name} ${e.done ? '✅' : ''}</td>
        <td style="padding:8px 12px;text-align:right;">₱${e.actual.toLocaleString()} / ₱${e.budget.toLocaleString()}</td>
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

  <!-- Header -->
  <div style="text-align:center;padding:28px 0 16px;border-bottom:1px solid #1c2b42;margin-bottom:24px;">
    <div style="display:inline-block;width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#f2a71b,#ff7a45);text-align:center;line-height:38px;color:#08111f;font-weight:900;font-size:16px;margin-bottom:10px;">B</div>
    <h1 style="margin:10px 0 4px;font-size:22px;font-weight:800;color:#eef5ff;">Financial Report</h1>
    <p style="margin:0;font-size:12px;color:#8ea0b8;">Generated on ${reportDate}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#8ea0b8;">Period: ${rangeLabel}</p>
  </div>

  <!-- Executive Summary -->
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">📊 Executive Summary</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;text-align:center;width:33%;">
          <div style="font-size:10px;color:#8ea0b8;text-transform:uppercase;font-weight:800;margin-bottom:4px;">Health Score</div>
          <div style="font-size:24px;font-weight:800;color:${grade.color};">${healthScore}/100</div>
          <div style="font-size:11px;color:${grade.color};font-weight:700;">${grade.emoji} ${grade.label}</div>
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

  <!-- Income & Expenses -->
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">💰 Income & Expense Analysis</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;">
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">Total Income</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:#4b8dff;">₱${Math.round(totalIncome).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">Total Expenses</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:#ff514f;">₱${Math.round(totalExpenses).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">Net Savings</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:${totalSavings >= 0 ? '#24d17e' : '#ff514f'};">₱${Math.round(totalSavings).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b42;"><td style="padding:10px 14px;color:#8ea0b8;">OT Income</td><td style="padding:10px 14px;text-align:right;font-weight:700;color:#7257ff;">₱${Math.round(totalOT).toLocaleString()}</td></tr>
      <tr><td colspan="2" style="padding:10px 14px;border-top:2px solid #1c2b42;"></td></tr>
      <tr style="border-bottom:1px solid #1c2b4233;"><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Fixed Expenses</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalFixed).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b4233;"><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Variable Expenses</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalVariable).toLocaleString()}</td></tr>
      <tr style="border-bottom:1px solid #1c2b4233;"><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Debt Payments</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalDebtPayments).toLocaleString()}</td></tr>
      <tr><td style="padding:6px 14px;color:#8ea0b8;font-size:12px;">  Investments</td><td style="padding:6px 14px;text-align:right;font-size:12px;">₱${Math.round(totalInvestments).toLocaleString()}</td></tr>
    </table>
  </div>

  <!-- Budget Compliance -->
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">📋 Budget Compliance</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;">
        <th style="padding:8px 12px;text-align:left;">Category</th>
        <th style="padding:8px 12px;text-align:right;">Budget</th>
        <th style="padding:8px 12px;text-align:right;">Actual</th>
        <th style="padding:8px 12px;text-align:right;">Used</th>
        <th style="padding:8px 12px;text-align:center;">Status</th>
      </tr>
      ${budgetRows}
    </table>
  </div>

  <!-- Asset Allocation -->
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">🏦 Asset Allocation</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;">
        <th style="padding:8px 12px;text-align:left;">Account</th>
        <th style="padding:8px 12px;text-align:left;">Type</th>
        <th style="padding:8px 12px;text-align:right;">Balance</th>
      </tr>
      ${accountRows}
      <tr style="border-top:2px solid #1c2b42;">
        <td colspan="2" style="padding:10px 12px;font-weight:800;">Total Assets</td>
        <td style="padding:10px 12px;text-align:right;font-weight:800;color:#24d17e;">₱${totalBal.toLocaleString()}</td>
      </tr>
    </table>
  </div>

  <!-- Debt Status -->
  ${debts.length > 0 ? `<div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">💳 Debt Status</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;">
        <th style="padding:8px 12px;text-align:left;">Debt</th>
        <th style="padding:8px 12px;text-align:right;">Balance</th>
        <th style="padding:8px 12px;text-align:right;">Limit</th>
        <th style="padding:8px 12px;text-align:right;">APR</th>
      </tr>
      ${debtRows}
      <tr style="border-top:2px solid #1c2b42;">
        <td style="padding:10px 12px;font-weight:800;">Total Owed</td>
        <td style="padding:10px 12px;text-align:right;font-weight:800;color:#ff514f;">₱${totalDebts.toLocaleString()}</td>
        <td colspan="2"></td>
      </tr>
    </table>
  </div>` : ''}

  <!-- Goals Progress -->
  ${majorExpenses.length > 0 ? `<div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">🎯 Goals Progress</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;font-size:13px;">
      <tr style="border-bottom:1px solid #1c2b42;color:#8ea0b8;">
        <th style="padding:8px 12px;text-align:left;">Goal</th>
        <th style="padding:8px 12px;text-align:right;">Progress</th>
        <th style="padding:8px 12px;text-align:right;">%</th>
        <th style="padding:8px 12px;">Bar</th>
      </tr>
      ${goalRows}
    </table>
  </div>` : ''}

  <!-- Insights -->
  <div style="margin-bottom:24px;">
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#eef5ff;border-bottom:1px solid #1c2b42;padding-bottom:8px;margin-bottom:12px;">💡 Smart Insights</h2>
    <table style="width:100%;border-collapse:collapse;background:#0f1a2a;border-radius:8px;border:1px solid #1c2b42;">
      ${insightRows}
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px 0;border-top:1px solid #1c2b42;color:#8ea0b8;font-size:11px;">
    <p style="margin:0;">This report was generated by Budget App 2026.</p>
    <p style="margin:4px 0 0;">Period: ${rangeLabel} • ${reportDate}</p>
  </div>

</div>
</body>
</html>`;
  };

  // ── Send email ──
  const handleSendEmail = async () => {
    if (!session?.user?.email) {
      setSendResult({ type: 'error', text: 'No signed-in email found. Please sign in first.' });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const html = generateEmailHTML();
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          html,
          recipientEmail: session.user.email,
          subject: `Budget App — Financial Report (${rangeLabel})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setSendResult({ type: 'success', text: `Report sent to ${session.user.email}!` });
    } catch (err) {
      setSendResult({ type: 'error', text: err.message });
    } finally {
      setSending(false);
    }
  };

  // ── Print ──
  const handlePrint = () => {
    const html = generateEmailHTML();
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  // ── Section wrapper ──
  const Section = ({ id, title, icon, children }) => {
    const isCollapsed = collapsedSections[id];
    return (
      <Card style={{ marginBottom: 0 }}>
        <div
          onClick={() => toggleSection(id)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginBottom: isCollapsed ? 0 : 12 }}
        >
          <SecTitle style={{ margin: 0 }}>{icon} {title}</SecTitle>
          <span style={{ fontSize: 11, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>{isCollapsed ? '▶ show' : '▼ hide'}</span>
        </div>
        {!isCollapsed && children}
      </Card>
    );
  };

  const userEmail = session?.user?.email || 'your email';

  return (
    <div ref={reportRef}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: sm ? 'flex-start' : 'center', gap: 14, marginBottom: 18, flexDirection: sm ? 'column' : 'row' }}>
        <div>
          <div style={{ fontSize: sm ? 20 : 25, fontWeight: 800, color: C.text }}>📊 Financial Report</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Generated {reportDate}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleSendEmail}
            disabled={sending}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`,
              color: '#fff',
              cursor: sending ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: sending ? 0.7 : 1,
              transition: 'opacity 0.2s, transform 0.15s',
              boxShadow: '0 4px 16px rgba(75,141,255,0.3)',
            }}
          >
            {sending ? '⏳ Sending...' : '📧 Send Report to Email'}
          </button>
          <Btn onClick={handlePrint} style={{ fontWeight: 600 }}>📄 Print / Save PDF</Btn>
        </div>
      </div>

      {/* Send result toast */}
      {sendResult && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          marginBottom: 14,
          background: sendResult.type === 'success' ? `${C.green}15` : `${C.red}15`,
          border: `1px solid ${sendResult.type === 'success' ? C.green : C.red}44`,
          color: sendResult.type === 'success' ? C.green : C.red,
          fontSize: 13,
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{sendResult.type === 'success' ? '✅' : '❌'} {sendResult.text}</span>
          <button onClick={() => setSendResult(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Recipient info */}
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        📬 Report will be sent to: <span style={{ color: C.text, fontWeight: 600 }}>{userEmail}</span>
      </div>

      {/* Range selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Report Period:</span>
        {[
          ['current', 'Current Month'],
          ['3m', 'Last 3 Months'],
          ['ytd', 'Year to Date'],
          ['12m', 'Last 12 Months'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setReportRange(v)} style={{
            padding: '7px 14px',
            borderRadius: 7,
            border: `1px solid ${reportRange === v ? C.purple : C.border}`,
            background: reportRange === v ? `${C.purple}33` : C.panel,
            color: reportRange === v ? C.text : C.muted,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: reportRange === v ? 700 : 500,
            transition: 'all 0.15s',
          }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
        Viewing: {rangeLabel} • {keys.length} month(s) of data
      </div>

      {/* ── Report sections ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Executive Summary */}
        <Section id="exec" title="Executive Summary" icon="📊">
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(4, 1fr)', gap: sm ? 8 : 12 }}>
            <MetricCard icon={grade.emoji} label="Financial Health" value={`${healthScore}/100`} sub={grade.label} color={grade.color} sm={sm} />
            <MetricCard icon="₱" label="Net Worth" value={peso(netWorth)} sub={`${accounts.length} accounts`} color={C.blue} sm={sm} />
            <MetricCard icon="%" label="Savings Rate" value={`${Math.round(avgRate)}%`} sub={`${active.length} month(s)`} color={C.green} sm={sm} />
            <MetricCard icon="🛡" label="Emergency Runway" value={`${safetyMonths.toFixed(1)} mo`} sub={peso(liquid) + ' liquid'} color={C.amber} sm={sm} />
          </div>
        </Section>

        {/* Income & Expense Analysis */}
        <Section id="income" title="Income & Expense Analysis" icon="💰">
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 10 }}>Summary</div>
              {[
                ['Total Income', peso(totalIncome), C.blue],
                ['Total Expenses', peso(totalExpenses), C.red],
                ['Net Savings', peso(totalSavings), totalSavings >= 0 ? C.green : C.red],
                ['OT Income', peso(totalOT), C.purple],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}22`, fontSize: 13 }}>
                  <span style={{ color: C.muted }}>{l}</span>
                  <span style={{ color: c, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 10 }}>Expense Breakdown</div>
              {[
                ['Fixed Expenses', peso(totalFixed), C.red],
                ['Variable Expenses', peso(totalVariable), C.orange],
                ['Debt Payments', peso(totalDebtPayments), C.amber],
                ['Investments', peso(totalInvestments), C.purple],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}22`, fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
                    <span style={{ color: C.muted }}>{l}</span>
                  </span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Monthly trend */}
          {stats.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 8 }}>Monthly Trend</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Month</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Income</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Expenses</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Savings</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map(s => (
                      <tr key={s.key} style={{ borderBottom: `1px solid ${C.border}11` }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{s.label}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: C.blue }}>{peso(s.income)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: C.red }}>{peso(s.expenses)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: s.savings >= 0 ? C.green : C.red }}>{peso(s.savings)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Math.round(s.savingsRate)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        {/* Budget Compliance */}
        <Section id="budget" title="Budget Compliance" icon="📋">
          {bvsA.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: 10 }}>No expense data for this period.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: C.muted }}>Category</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Budget</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Actual</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Used %</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', color: C.muted }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bvsA.map((row, i) => {
                    const pct = row.budget > 0 ? (row.actual / row.budget) * 100 : 0;
                    const isOver = row.actual > row.budget;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}11` }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{row.name}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{peso(row.budget)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: isOver ? C.red : C.text }}>{peso(row.actual)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 10, color: isOver ? C.red : C.muted }}>{pct.toFixed(0)}%</span>
                            <div style={{ width: 50, height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: isOver ? C.red : C.green }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {isOver ? <span style={{ color: C.red }}>⚠️ Over</span> : <span style={{ color: C.green }}>✅ OK</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Asset Allocation */}
        <Section id="assets" title="Asset Allocation" icon="🏦">
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 14 }}>
            <div>
              {Object.entries(accountsByType).map(([type, accs]) => (
                <div key={type} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_CLR[type] || C.muted, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: TYPE_CLR[type] || C.muted }}>{type}</span>
                    <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>{peso(accs.reduce((s, a) => s + a.balance, 0))}</span>
                  </div>
                  {accs.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0 4px 16px', borderBottom: `1px solid ${C.border}11` }}>
                      <span>{a.name}</span>
                      <span style={{ fontWeight: 600 }}>{peso(a.balance)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: `${C.blue}11`, borderRadius: 8, border: `1px solid ${C.blue}33` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Total Assets</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>{peso(totalBal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: `${C.red}11`, borderRadius: 8, border: `1px solid ${C.red}33` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Total Liabilities</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.red }}>{peso(totalDebts)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: `${C.green}11`, borderRadius: 8, border: `1px solid ${C.green}33` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Net Worth</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{peso(netWorth)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: `${C.purple}11`, borderRadius: 8, border: `1px solid ${C.purple}33` }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Outstanding Credits</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>{peso(totalCredits)}</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Debt Status */}
        {debts.length > 0 && (
          <Section id="debts" title="Debt Status" icon="💳">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: C.muted }}>Debt</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Balance</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Limit</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>APR</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Min Payment</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: C.muted }}>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map(d => {
                    const util = d.limit > 0 ? (d.balance / d.limit) * 100 : 0;
                    return (
                      <tr key={d.id} style={{ borderBottom: `1px solid ${C.border}11` }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{d.name}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: C.red, fontWeight: 700 }}>{peso(d.balance)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: C.muted }}>{peso(d.limit)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{d.apr}%</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: C.amber }}>{peso(d.minPayment)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 10, color: util > 50 ? C.red : C.muted }}>{util.toFixed(0)}%</span>
                            <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(util, 100)}%`, height: '100%', background: util > 70 ? C.red : util > 40 ? C.amber : C.green }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '10px 8px', borderTop: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700 }}>
              <span>Total Outstanding Debt</span>
              <span style={{ color: C.red }}>{peso(totalDebts)}</span>
            </div>
          </Section>
        )}

        {/* Goals Progress */}
        {majorExpenses.length > 0 && (
        <Section id="goals" title="Goals Progress" icon="🎯">
            <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 10 }}>
              {majorExpenses.map(e => {
                const pct = e.budget > 0 ? (e.actual / e.budget) * 100 : 0;
                return (
                  <div key={e.id} style={{ padding: '10px 12px', background: e.done ? `${C.green}08` : `${C.blue}08`, borderRadius: 8, border: `1px solid ${e.done ? C.green : C.border}33` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{e.name} {e.done ? '✅' : ''}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{e.date || ''}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, marginBottom: 4 }}>
                      <span>{peso(e.actual)} / {peso(e.budget)}</span>
                      <span style={{ fontWeight: 700, color: pct >= 100 ? C.green : C.text }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ background: C.border, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: e.done ? C.green : C.blue, borderRadius: 4, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Smart Insights */}
        <Section id="insights" title="Smart Insights" icon="💡">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13,
                padding: '10px 12px', borderRadius: 8,
                background: ins.type === 'warn' ? `${C.red}11` : ins.type === 'good' ? `${C.green}11` : `${C.blue}11`,
                border: `1px solid ${ins.type === 'warn' ? C.red : ins.type === 'good' ? C.green : C.blue}22`,
              }}>
                <span style={{ color: ins.type === 'warn' ? C.red : ins.type === 'good' ? C.green : C.blue, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {ins.type === 'warn' ? '⚠️ Warning:' : ins.type === 'good' ? '✅ Healthy:' : 'ℹ️ Note:'}
                </span>
                <span style={{ color: C.text }}>{ins.text}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Scheduled Reports Manager ── */}
        <ScheduleManager session={session} sm={sm} />

      </div>
    </div>
  );
}

// ─── SCHEDULE MANAGER ─────────────────────────────────────────────────────────
function ScheduleManager({ session, sm }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggeringId, setTriggeringId] = useState(null);
  const [formError, setFormError] = useState('');

  // Scheduler logs state
  const [logs, setLogs] = useState({});
  const [loadingLogs, setLoadingLogs] = useState({});
  const [openLogsId, setOpenLogsId] = useState(null);

  const handleViewLogs = async (scheduleId) => {
    if (openLogsId === scheduleId) {
      setOpenLogsId(null);
      return;
    }
    setOpenLogsId(scheduleId);
    if (logs[scheduleId]) return;
    setLoadingLogs(prev => ({ ...prev, [scheduleId]: true }));
    try {
      const res = await fetch(`/api/schedules?action=logs&scheduleId=${scheduleId}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (data.logs) {
        setLogs(prev => ({ ...prev, [scheduleId]: data.logs }));
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(prev => ({ ...prev, [scheduleId]: false }));
    }
  };

  // Form state
  const [freq, setFreq] = useState('daily');
  const [time, setTime] = useState('08:00');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [minuteInterval, setMinuteInterval] = useState(15);
  const [range, setRange] = useState('current');

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const RANGE_LABELS = { current: 'Current Month', '3m': 'Last 3 Months', ytd: 'Year to Date', '12m': 'Last 12 Months' };

  const fetchSchedules = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/schedules', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedules(); }, [session]);

  const handleAdd = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          frequency: freq,
          time: freq === 'minutes' ? '00:00' : time,
          day_of_week: freq === 'weekly' ? dayOfWeek : undefined,
          day_of_month: freq === 'monthly' ? dayOfMonth : (freq === 'minutes' ? minuteInterval : undefined),
          report_range: range,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create schedule');
      setSchedules(prev => [data.schedule, ...prev]);
      setShowForm(false);
      setFreq('daily');
      setTime('08:00');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id, currentEnabled) => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`/api/schedules?id=${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (res.ok && data.schedule) {
        setSchedules(prev => prev.map(s => s.id === id ? data.schedule : s));
      }
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!session?.access_token) return;
    try {
      await fetch(`/api/schedules?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleTriggerNow = async (id) => {
    if (!session?.access_token) return;
    setTriggeringId(id);
    try {
      const res = await fetch(`/api/schedules?action=trigger&id=${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger schedule');
      alert('⚡ Report sent immediately!');
      fetchSchedules(); // Refresh last sent timestamp
    } catch (err) {
      alert(`Error triggering report: ${err.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  const getScheduleLabel = (s) => {
    if (s.frequency === 'daily') return `Daily at ${s.time}`;
    if (s.frequency === 'weekly') return `Weekly on ${DAYS[s.day_of_week || 0]} at ${s.time}`;
    if (s.frequency === 'monthly') return `Monthly on day ${s.day_of_month || 1} at ${s.time}`;
    if (s.frequency === 'minutes') return `Every ${s.day_of_month || 15} minutes`;
    return s.frequency;
  };

  const getNextRun = (s) => {
    if (!s.enabled) return 'Paused';
    const now = new Date();

    if (s.frequency === 'minutes') {
      const interval = s.day_of_month || 15;
      const currentMin = now.getMinutes();
      const minToNext = interval - (currentMin % interval);
      return `In ~${minToNext} minute(s)`;
    }

    const [h, m] = s.time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);

    if (s.frequency === 'daily') {
      if (next <= now) next.setDate(next.getDate() + 1);
    } else if (s.frequency === 'weekly') {
      const target = s.day_of_week ?? 1;
      let diff = target - now.getDay();
      if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
      next.setDate(next.getDate() + diff);
    } else if (s.frequency === 'monthly') {
      const target = s.day_of_month ?? 1;
      next.setDate(target);
      if (next <= now) next.setMonth(next.getMonth() + 1);
    }

    const diffMs = next - now;
    const diffHrs = Math.round(diffMs / 3600000);
    if (diffHrs < 1) return 'Less than 1 hour';
    if (diffHrs < 24) return `In ~${diffHrs} hour(s)`;
    const diffDays = Math.round(diffHrs / 24);
    return `In ~${diffDays} day(s)`;
  };

  const inputStyle = {
    padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
    background: C.bg, color: C.text, fontSize: 13, outline: 'none',
    fontFamily: 'inherit',
  };
  const selectStyle = { ...inputStyle, cursor: 'pointer' };

  return (
    <Card style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <SecTitle style={{ margin: 0 }}>⏰ Scheduled Reports</SecTitle>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '7px 14px', borderRadius: 7, border: 'none',
            background: showForm ? `${C.red}33` : `${C.green}33`,
            color: showForm ? C.red : C.green,
            cursor: 'pointer', fontSize: 12, fontWeight: 700,
          }}
        >
          {showForm ? '✕ Cancel' : '+ Add Schedule'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
        Set up recurring reports that are automatically emailed to your signed-in address. The MCP server must be running for scheduled emails to send.
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{
          padding: 16, borderRadius: 10, border: `1px solid ${C.purple}44`,
          background: `${C.purple}08`, marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>New Schedule</div>
          <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Frequency</label>
              <select value={freq} onChange={e => setFreq(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="minutes">Every X Minutes</option>
              </select>
            </div>
            {freq === 'weekly' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Day of Week</label>
                <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} style={{ ...selectStyle, width: '100%' }}>
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {freq === 'monthly' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Day of Month</label>
                <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} style={{ ...selectStyle, width: '100%' }}>
                  {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </div>
            )}
            {freq === 'minutes' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Interval (Minutes)</label>
                <select value={minuteInterval} onChange={e => setMinuteInterval(Number(e.target.value))} style={{ ...selectStyle, width: '100%' }}>
                  {[5, 10, 15, 20, 30, 45, 60].map(v => <option key={v} value={v}>Every {v} Minutes</option>)}
                </select>
              </div>
            )}
            {freq !== 'minutes' && (
              <div>
                <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Time (24h)</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: 'block', marginBottom: 4 }}>Report Range</label>
              <select value={range} onChange={e => setRange(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                {Object.entries(RANGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {formError && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>❌ {formError}</div>}
          <button
            onClick={handleAdd}
            disabled={saving}
            style={{
              padding: '9px 20px', borderRadius: 7, border: 'none',
              background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`,
              color: '#fff', cursor: saving ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '⏳ Saving...' : '✅ Create Schedule'}
          </button>
        </div>
      )}

      {/* Schedule list */}
      {loading ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 10 }}>Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 16, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 8 }}>
          No scheduled reports yet. Click "+ Add Schedule" to create one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schedules.map(s => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
              <div style={{
                display: 'flex', alignItems: sm ? 'flex-start' : 'center',
                flexDirection: sm ? 'column' : 'row',
                gap: sm ? 8 : 14,
                padding: '12px 14px', borderRadius: 8,
                border: `1px solid ${s.enabled ? C.border : `${C.border}55`}`,
                background: s.enabled ? C.panel : `${C.panel}88`,
                opacity: s.enabled ? 1 : 0.7,
                transition: 'opacity 0.2s',
              }}>
                {/* Left: Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
                      padding: '2px 6px', borderRadius: 4,
                      background: s.frequency === 'daily' ? `${C.blue}22` : s.frequency === 'weekly' ? `${C.purple}22` : s.frequency === 'monthly' ? `${C.amber}22` : `${C.green}22`,
                      color: s.frequency === 'daily' ? C.blue : s.frequency === 'weekly' ? C.purple : s.frequency === 'monthly' ? C.amber : C.green,
                      border: `1px solid ${s.frequency === 'daily' ? C.blue : s.frequency === 'weekly' ? C.purple : s.frequency === 'monthly' ? C.amber : C.green}33`,
                    }}>
                      {s.frequency}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{getScheduleLabel(s)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.muted, flexWrap: 'wrap' }}>
                    <span>📊 {RANGE_LABELS[s.report_range] || s.report_range}</span>
                    <span>⏭ {getNextRun(s)}</span>
                    {s.last_sent_at && <span>✅ Last sent: {new Date(s.last_sent_at).toLocaleString()}</span>}
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  <button
                    disabled={triggeringId === s.id}
                    onClick={() => handleTriggerNow(s.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 5, border: 'none',
                      background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`,
                      color: '#fff', cursor: triggeringId === s.id ? 'wait' : 'pointer',
                      fontSize: 11, fontWeight: 700, opacity: triggeringId === s.id ? 0.7 : 1,
                    }}
                  >
                    {triggeringId === s.id ? '⏳ Sending...' : '⚡ Send Now'}
                  </button>
                  <button
                    onClick={() => handleToggle(s.id, s.enabled)}
                    style={{
                      padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.border}`,
                      background: s.enabled ? `${C.green}22` : `${C.muted}11`,
                      color: s.enabled ? C.green : C.muted,
                      cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {s.enabled ? '🟢 Active' : '⏸ Paused'}
                  </button>
                  <button
                    onClick={() => handleViewLogs(s.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.border}`,
                      background: openLogsId === s.id ? `${C.purple}22` : 'transparent',
                      color: openLogsId === s.id ? C.purple : C.muted,
                      cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    📜 Logs
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.red}33`,
                      background: `${C.red}11`, color: C.red,
                      cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Logs dropdown panel */}
              {openLogsId === s.id && (
                <div style={{
                  padding: '12px 14px', borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: `${C.panel}bb`,
                  fontSize: 12,
                  marginTop: -2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <div style={{ fontWeight: 600, color: C.muted, display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Execution History (Last 10 runs)</span>
                    {loadingLogs[s.id] && <span style={{ fontSize: 11, fontWeight: 500 }}>⏳ Loading...</span>}
                  </div>
                  {loadingLogs[s.id] && !logs[s.id] ? null : (!logs[s.id] || logs[s.id].length === 0) ? (
                    <div style={{ color: C.muted, padding: '4px 0', fontStyle: 'italic' }}>No execution logs recorded yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {logs[s.id].map(log => (
                        <div key={log.id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: sm ? 'flex-start' : 'center',
                          flexDirection: sm ? 'column' : 'row', gap: sm ? 4 : 8,
                          padding: '6px 10px', borderRadius: 5, background: `${C.bg}66`,
                          borderLeft: `3px solid ${log.status === 'success' ? C.green : C.red}`
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 700, marginRight: 8, color: log.status === 'success' ? C.green : C.red, fontSize: 10, letterSpacing: '0.02em' }}>
                              {log.status === 'success' ? '✅ SUCCESS' : '❌ FAILED'}
                            </span>
                            <span style={{ color: C.muted, fontSize: 11 }}>
                              {new Date(log.triggered_at).toLocaleString()}
                            </span>
                            {log.error_message && (
                              <div style={{ fontSize: 11, color: C.red, marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                Error: {log.error_message}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: C.muted, alignSelf: sm ? 'flex-end' : 'auto' }}>{log.recipient_email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}



// ─── ROOT ─────────────────────────────────────────────────────────────────────
const checkSessionAdmin = (sess) => {
  if (!sess || !sess.user) return false;
  const email = sess.user.email || "";
  const role = sess.user.app_metadata?.role;
  return role === "admin" || email.toLowerCase() === "rolanmolano_77@yahoo.com";
};

export default function App() {
  const width=useWidth();
  const sm=width<640;
  const [tab,setTab]=useState('dashboard');
  const [fakeMode, setFakeMode] = useState(() => {
    try {
      return localStorage.getItem('budget-fake-mode') === 'true';
    } catch (_) {
      return false;
    }
  });

  // Keep window global in sync for utility formatters
  if (typeof window !== 'undefined') {
    window.isFakeModeEnabled = fakeMode;
  }

  useEffect(() => {
    try {
      localStorage.setItem('budget-fake-mode', fakeMode);
    } catch (_) {}
  }, [fakeMode]);

  const [loaded,setLoaded]=useState(false);
  const [budgetData,setBudgetData]=useState({});
  const [accounts,setAccounts]=useState(() => isSupabaseConfigured ? [] : DEF_ACCOUNTS);
  const [majorExpenses,setMajorExpenses]=useState(() => isSupabaseConfigured ? [] : DEF_MAJOR);
  const [credits, setCredits] = useState([]);
  const [debts, setDebts] = useState(() => isSupabaseConfigured ? [] : DEF_DEBTS);
  const [balanceHistory, setBalanceHistory] = useState([]);

  // Supabase Auth and Sync States
  const [session, setSession] = useState(null);
  const [syncStatus, setSyncStatus] = useState('saved');
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState('user');
  const [permissions, setPermissions] = useState({});

  // Admin Impersonation and User States (raised to root level)
  const [viewingUserId, setViewingUserId] = useState(null);
  const [viewingUserEmail, setViewingUserEmail] = useState('');
  const [users, setUsers] = useState([]);
  const [adminConfigured, setAdminConfigured] = useState(false);

  const ready = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/profile", {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[App Client] fetchProfile API response:", data);
        setRole(data.role || 'user');
        setPermissions(data.permissions || {});
        setIsAdmin(data.role === 'admin');
      } else {
        console.warn("[App Client] fetchProfile API failed with status:", res.status);
      }
    } catch (err) {
      console.error("Error fetching user profile permissions:", err);
    }
  };

  // Check role & permissions on session change
  useEffect(() => {
    console.log("[App Client] Auth session changed:", session ? session.user.email : "null");
    if (!session) {
      setIsAdmin(false);
      setRole('user');
      setPermissions({});
      activeUserIsAdmin = false;
      return;
    }
    activeUserIsAdmin = checkSessionAdmin(session);
    fetchProfile();
  }, [session]);

  async function fetchUsers() {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) return;
      
      const checkRes = await fetch("/api/admin/check", {
        headers: {
          "Authorization": `Bearer ${currentSession.access_token}`
        }
      });
      const checkData = await checkRes.json();
      setAdminConfigured(Boolean(checkData.adminConfigured));

      if (checkData.adminConfigured) {
        const res = await fetch("/api/admin/roles", {
          headers: {
            "Authorization": `Bearer ${currentSession.access_token}`
          }
        });
        const data = await res.json();
        if (res.ok) {
          setUsers(data.users || []);
        }
      }
    } catch (err) {
      console.error("Error fetching users at App root:", err);
    }
  }

  // Fetch users list automatically when admin is logged in
  useEffect(() => {
    if (session && isAdmin && isSupabaseConfigured) {
      fetchUsers();
    }
  }, [session, isAdmin]);

  async function loadTargetUserData(targetUserId) {
    setLoaded(false);
    try {
      const res = await fetch(`/api/admin/user-data?userId=${targetUserId}`, {
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch user data.");
      
      const userData = data.userData;
      const targetUser = users.find(u => u.id === targetUserId);
      const isTargetAdmin = targetUser && (targetUser.role === 'admin' || targetUser.email?.toLowerCase() === "rolanmolano_77@yahoo.com");
      
      const fallbackAccounts = isTargetAdmin ? DEF_ACCOUNTS : [];
      const fallbackMajor = isTargetAdmin ? DEF_MAJOR : [];
      const fallbackDebts = isTargetAdmin ? DEF_DEBTS : [];

      if (userData) {
        setBudgetData(userData.budget_data || {});
        setAccounts(userData.accounts || fallbackAccounts);
        setMajorExpenses(userData.major_expenses || fallbackMajor);
        setCredits(userData.credits || []);
        setDebts(userData.debts || fallbackDebts);
        setBalanceHistory(userData.balance_history || []);
      } else {
        setBudgetData({});
        setAccounts(fallbackAccounts);
        setMajorExpenses(fallbackMajor);
        setCredits([]);
        setDebts(fallbackDebts);
        setBalanceHistory(fallbackAccounts.length > 0 ? generateMockBalanceHistory(fallbackAccounts) : []);
      }
    } catch (err) {
      console.error("Error loading user data for impersonation:", err);
    } finally {
      setLoaded(true);
    }
  }

  // Fetch data on session change or impersonation target change
  useEffect(() => {
    if (!isSupabaseConfigured) {
      ready.current = true;
      setLoaded(true);
      setSyncStatus('saved');
      setBalanceHistory(prev => prev.length ? prev : generateMockBalanceHistory(accounts));
      return;
    }

    if (!session) {
      ready.current = false;
      setLoaded(false);
      return;
    }

    if (viewingUserId && viewingUserId !== session.user.id) {
      loadTargetUserData(viewingUserId);
      return;
    }

    async function loadCloudData() {
      try {
        const { data, error } = await supabase
          .from('user_data')
          .select('*')
          .eq('user_id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        const sessIsAdmin = checkSessionAdmin(session);
        const fallbackAccounts = sessIsAdmin ? DEF_ACCOUNTS : [];
        const fallbackMajor = sessIsAdmin ? DEF_MAJOR : [];
        const fallbackDebts = sessIsAdmin ? DEF_DEBTS : [];

        if (data) {
          let loadedAccounts = data.accounts || fallbackAccounts;
          let loadedMajor = data.major_expenses || fallbackMajor;
          let loadedDebts = data.debts || fallbackDebts;
          let loadedBudget = data.budget_data || {};
          let loadedHistory = data.balance_history || [];

          // WIPE TEMPLATE DATA FOR STANDARD USERS
          if (!sessIsAdmin) {
            const hasDefaultAccounts = loadedAccounts.some(a => a.id === 'sla-c' && a.balance === 507000);
            
            // Also check if budget data has default templates
            let budgetUpdated = false;
            const cleanBudget = { ...loadedBudget };
            for (const key in cleanBudget) {
              const monthData = cleanBudget[key];
              if (monthData) {
                ['5th', '20th'].forEach(payday => {
                  const p = monthData[payday];
                  if (p) {
                    const hasDefaultSalary = p.salary === 27000;
                    const hasDefaultExpenses = p.expenses && p.expenses.some(e => e.name === 'Rent' && e.budget === 18000);
                    if (hasDefaultSalary || hasDefaultExpenses) {
                      monthData[payday] = {
                        salary: 0,
                        ot: { weekday: 0, weekend: 0 },
                        expenses: []
                      };
                      budgetUpdated = true;
                    }
                  }
                });
              }
            }

            if (hasDefaultAccounts || budgetUpdated) {
              if (hasDefaultAccounts) {
                loadedAccounts = [];
                loadedMajor = [];
                loadedDebts = [];
                loadedHistory = [];
              }
              if (budgetUpdated) {
                loadedBudget = cleanBudget;
              }
              
              // Sync the cleared state back to the database immediately to save it
              supabase.from('user_data').upsert({
                user_id: session.user.id,
                budget_data: loadedBudget,
                accounts: loadedAccounts,
                major_expenses: loadedMajor,
                credits: [],
                debts: loadedDebts,
                balance_history: loadedHistory,
                updated_at: new Date().toISOString()
              }).then(({ error }) => {
                if (error) console.error("Error clearing standard user template data:", error);
              });
            }
          }

          setBudgetData(loadedBudget);
          setAccounts(loadedAccounts);
          setMajorExpenses(loadedMajor);
          setCredits(data.credits || []);
          setDebts(loadedDebts);
          setBalanceHistory(loadedHistory);
        } else {
          // No cloud data yet (first login).
          // Attempt migration from user-partitioned local storage fallback.
          const userIdSuffix = '-' + session.user.id;
          const bd = await safeGet('bujdet-v2-budgetData' + userIdSuffix);
          const acc = await safeGet('bujdet-accounts' + userIdSuffix);
          const me = await safeGet('bujdet-majorExpenses' + userIdSuffix);
          const cr = await safeGet('bujdet-credits' + userIdSuffix);
          const db = await safeGet('bujdet-debts' + userIdSuffix);
          const bh = await safeGet('bujdet-balanceHistory' + userIdSuffix);

          const initialBudget = bd && Object.keys(bd).length > 0 ? bd : {};
          const initialAccounts = acc || fallbackAccounts;
          const initialMajor = me || fallbackMajor;
          const initialCredits = cr || [];
          const initialDebts = db || fallbackDebts;
          const initialHistory = (bh && bh.length > 0) ? bh : (initialAccounts.length > 0 ? generateMockBalanceHistory(initialAccounts) : []);

          setBudgetData(initialBudget);
          setAccounts(initialAccounts);
          setMajorExpenses(initialMajor);
          setCredits(initialCredits);
          setDebts(initialDebts);
          setBalanceHistory(initialHistory);

          await supabase.from('user_data').insert({
            user_id: session.user.id,
            budget_data: initialBudget,
            accounts: initialAccounts,
            major_expenses: initialMajor,
            credits: initialCredits,
            debts: initialDebts,
            balance_history: initialHistory,
            updated_at: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error('Error loading data from Supabase:', err);
      } finally {
        ready.current = true;
        setLoaded(true);
      }
    }

    loadCloudData();
  }, [session, viewingUserId]);

  // Debounced Cloud Sync to Supabase (supporting admin impersonated sync)
  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    if (!ready.current || !session) return;

    setSyncStatus('syncing');
    const timer = setTimeout(async () => {
      try {
        if (viewingUserId && viewingUserId !== session.user.id) {
          // Sync impersonated user's data via Admin API
          const res = await fetch(`/api/admin/user-data?userId=${viewingUserId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              budgetData,
              accounts,
              majorExpenses,
              credits,
              debts,
              balanceHistory
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to sync target user data');
        } else {
          // Sync own data directly
          const { error } = await supabase
            .from('user_data')
            .upsert({
              user_id: session.user.id,
              budget_data: budgetData,
              accounts: accounts,
              major_expenses: majorExpenses,
              credits: credits,
              debts: debts,
              balance_history: balanceHistory,
              updated_at: new Date().toISOString()
            });
          if (error) throw error;
        }
        setSyncStatus('saved');
      } catch (err) {
        console.error('Error syncing budget data to cloud:', err);
        setSyncStatus('error');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [budgetData, accounts, majorExpenses, credits, debts, balanceHistory, session, viewingUserId]);

  // Keep local storage updated as a secondary fallback/offline cache (partitioned by user id, only for own account)
  useEffect(() => { if (ready.current && session && (!viewingUserId || viewingUserId === session.user.id)) safeSet('bujdet-v2-budgetData-' + session.user.id, budgetData); }, [budgetData, session, viewingUserId]);
  useEffect(() => { if (ready.current && session && (!viewingUserId || viewingUserId === session.user.id)) safeSet('bujdet-accounts-' + session.user.id, accounts); }, [accounts, session, viewingUserId]);
  useEffect(() => { if (ready.current && session && (!viewingUserId || viewingUserId === session.user.id)) safeSet('bujdet-majorExpenses-' + session.user.id, majorExpenses); }, [majorExpenses, session, viewingUserId]);
  useEffect(() => { if (ready.current && session && (!viewingUserId || viewingUserId === session.user.id)) safeSet('bujdet-credits-' + session.user.id, credits); }, [credits, session, viewingUserId]);
  useEffect(() => { if (ready.current && session && (!viewingUserId || viewingUserId === session.user.id)) safeSet('bujdet-debts-' + session.user.id, debts); }, [debts, session, viewingUserId]);
  useEffect(() => { if (ready.current && session && (!viewingUserId || viewingUserId === session.user.id)) safeSet('bujdet-balanceHistory-' + session.user.id, balanceHistory); }, [balanceHistory, session, viewingUserId]);

  const getPermission = (tabId) => {
    if (permissions && permissions[tabId]) return permissions[tabId];
    if (role === "admin") return "update";
    if (role === "viewer") return "read";
    if (role === "guest") return tabId === "dashboard" ? "read" : "none";
    const baselineModules = new Set(["dashboard", "history", "budget", "accounts", "debts", "credits", "expenses", "calendar", "reports"]);
    return baselineModules.has(tabId) ? "update" : "none";
  };

  const TABS=[
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
  ].filter(t => getPermission(t.id) !== 'none');

  const TLBL={
    dashboard:'Dashboard',
    history:'History',
    budget:'Monthly Budget',
    accounts:'Accounts',
    'account-manager':'Account Manager',
    reconcile:'Reconcile & Audit',
    investments:'Investments',
    debts:'Debt Manager',
    credits:'Credits (Money Owed)',
    expenses:'Major Expenses',
    calendar:'Financial Calendar',
    graph:'Financial Knowledge Graph',
    reports:'Financial Reports',
    admin:'Admin Panel'
  };

  const NAV_TABS=[
    {id:'dashboard',   label:'Dashboard',          icon:'📊',group:'main'},
    {id:'accounts',       label:'Accounts',              icon:'🏦',group:'manage'},
    {id:'account-manager', label:'Account Manager',       icon:'🗂️',group:'manage'},
    {id:'reconcile',       label:'Reconcile & Audit',     icon:'🔍',group:'manage'},
    {id:'transactions',label:'Transactions',       icon:'💸',group:'manage'},
    // Balance Log removed — superseded by Reconcile & Audit tab (data preserved)
    {id:'debts',       label:'Debts',              icon:'💳',group:'manage'},
    {id:'credits',     label:'Credits (Owed to You)',icon:'🤝',group:'manage'},
    {id:'expenses',    label:'Goals',              icon:'🎯',group:'manage'},
    {id:'budget',      label:'Monthly Budget',     icon:'📅',group:'manage'},
    {id:'history',     label:'Budget History',     icon:'📋',group:'manage'},
    {id:'calendar',    label:'Bills',              icon:'🗓',group:'manage'},
    {id:'investments', label:'Investments',        icon:'📈',group:'analytics'},
    {id:'graph',       label:'Financial Graph',    icon:'🕸',group:'analytics'},
    {id:'reports',     label:'Reports',            icon:'📊',group:'analytics'},
    ...(isAdmin ? [{id:'admin', label:'Admin Panel',icon:'⚙️',group:'admin'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');

  const navGroups = [
    ['main', ''],
    ['manage', 'Manage'],
    ['analytics', 'Analytics'],
    ...(isAdmin ? [['admin', 'System']] : []),
  ];
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [deactivatedMsg, setDeactivatedMsg] = useState(null);

  const userMeta = session?.user?.user_metadata || {};
  const userFirstName = userMeta.first_name || '';
  const userLastName = userMeta.last_name || '';
  const userFullName = userMeta.full_name || `${userFirstName} ${userLastName}`.trim();
  const userAvatarUrl = userMeta.avatar_url || '';
  const displayName = userFullName || session?.user?.email || 'User';
  const avatarInitial = (displayName.charAt(0) || 'U').toUpperCase();

  console.log("[App Client] Rendering navigation panel - isAdmin:", isAdmin, "role:", role, "navGroups:", navGroups);

  if (!session && isSupabaseConfigured) {
    return (
      <>
        {deactivatedMsg && (
          <div style={{ background: C.red, color: '#fff', padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
            ⚠️ {deactivatedMsg}
          </div>
        )}
        <Auth />
      </>
    );
  }

  return (
    <div style={{background:`radial-gradient(circle at 80% -20%, ${C.blue}18, transparent 36%), ${C.bg}`,minHeight:'100vh',fontFamily:"Inter, 'Segoe UI', system-ui, sans-serif",color:C.text}}>
      {!sm && (
        <aside style={{position:'fixed',left:0,top:0,bottom:0,width:250,background:'linear-gradient(180deg,#071120,#030914)',borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',zIndex:20}}>
          <div style={{height:58,display:'flex',alignItems:'center',gap:10,padding:'0 18px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:24,height:24,borderRadius:7,background:`linear-gradient(135deg, ${C.amber}, ${C.orange})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#08111f',fontWeight:900,fontSize:13}}>B</div>
            <div style={{fontSize:15,fontWeight:800}}>Budget App 2026</div>
          </div>
          <div style={{ padding: '6px 18px', fontSize: 10, color: C.amber, background: `${C.bg}dd`, borderBottom: `1px solid ${C.border}33`, fontFamily: 'monospace' }}>
            Role: {role} | Admin: {isAdmin ? "YES" : "NO"}
          </div>
          {isAdmin && (
            <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}33`, background: `${C.panel}44` }}>
              <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase' }}>Viewing User Account:</label>
              <select
                value={viewingUserId || session.user.id}
                onChange={e => {
                  const val = e.target.value;
                  if (val === session.user.id) {
                    setViewingUserId(null);
                    setViewingUserEmail('');
                  } else {
                    setViewingUserId(val);
                    const selectedUser = users.find(u => u.id === val);
                    setViewingUserEmail(selectedUser ? selectedUser.email : '');
                  }
                }}
                style={{
                  background: C.bg,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 12,
                  width: '100%',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={session.user.id}>Yourself ({session.user.email})</option>
                {users.filter(u => u.id !== session.user.id).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName ? `${u.fullName} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <nav style={{padding:12,display:'flex',flexDirection:'column',gap:14,flex:1,overflowY:'auto'}}>
            {navGroups.map(([group,label]) => (
              <div key={group}>
                {label && <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em',color:C.muted,fontWeight:800,padding:'8px 6px 7px'}}>{label}</div>}
                {NAV_TABS.filter(t => t.group === group).map(t => (
                  <button key={t.id} onClick={()=>setTab(t.id)} style={{width:'100%',height:39,border:'none',borderRadius:6,background:tab===t.id?`${C.purple}44`:'transparent',color:tab===t.id?C.text:C.muted,cursor:'pointer',display:'flex',alignItems:'center',gap:10,padding:'0 10px',fontSize:12,fontWeight:tab===t.id?700:500,textAlign:'left'}}>
                    <span style={{width:19,height:19,borderRadius:5,border:`1px solid ${tab===t.id?C.purple:C.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:tab===t.id?C.text:C.muted,background:tab===t.id?`${C.purple}55`:'transparent'}}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div 
            onClick={() => setShowProfileModal(true)} 
            title="Click to edit profile settings" 
            style={{margin:12,padding:12,border:`1px solid ${C.border}`,borderRadius:8,display:'flex',alignItems:'center',gap:10,background:C.panel,cursor:'pointer'}}
          >
            <div style={{
              width:34, height:34, borderRadius:'50%',
              background: userAvatarUrl ? `url(${userAvatarUrl}) center/cover no-repeat` : `linear-gradient(135deg, ${C.amber}, ${C.orange})`,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#08111f', fontWeight:900, fontSize:14, flexShrink:0
            }}>
              {!userAvatarUrl && avatarInitial}
            </div>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:12,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{displayName}</div>
              <div style={{fontSize:10,color:C.blue,fontWeight:600}}>⚙️ Edit Profile</div>
            </div>
            {isSupabaseConfigured && (
              <button onClick={(e) => { e.stopPropagation(); supabase.auth.signOut(); }} style={{border:'none',background:'transparent',color:C.muted,fontSize:11,padding:0,cursor:'pointer'}}>Sign out</button>
            )}
          </div>
        </aside>
      )}
      <div style={{background:'rgba(4,10,20,0.84)',backdropFilter:'blur(12px)',borderBottom:`1px solid ${C.border}`,padding:sm?'0 16px':'0 24px',display:'flex',justifyContent:'space-between',alignItems:'center',height:sm?52:58,marginLeft:sm?0:250,position:'sticky',top:0,zIndex:15}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:sm?16:20,fontWeight:700,color:sm?C.text:C.muted}}>{sm?'Budget App 2026':'Menu'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: !loaded ? C.amber : syncStatus === 'saved' ? C.green : syncStatus === 'syncing' ? C.amber : C.red }}>
            {!isSupabaseConfigured ? 'Local Demo Mode' : !loaded ? 'Loading...' : syncStatus === 'saved' ? 'Saved to Cloud' : syncStatus === 'syncing' ? 'Syncing...' : 'Sync Error'}
          </span>
          <div 
            onClick={() => setShowProfileModal(true)} 
            title="Click to edit profile settings" 
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: userAvatarUrl ? `url(${userAvatarUrl}) center/cover no-repeat` : `linear-gradient(135deg, ${C.purple}, ${C.blue})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 12, border: `1px solid ${C.border}`, flexShrink: 0
            }}>
              {!userAvatarUrl && avatarInitial}
            </div>
            {!sm && <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{displayName}</span>}
          </div>
          <button 
            onClick={() => setFakeMode(p => !p)} 
            style={{ 
              padding: '4px 8px', 
              borderRadius: 5, 
              border: `1px solid ${fakeMode ? C.amber : C.border}`, 
              background: fakeMode ? `${C.amber}22` : 'transparent', 
              color: fakeMode ? C.amber : C.muted, 
              cursor: 'pointer', 
              fontSize: 11,
              fontWeight: fakeMode ? 700 : 500,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {fakeMode ? '🤫 Fake Mode ON' : '🕵️‍♂️ Fake Mode'}
          </button>
          {isSupabaseConfigured && (
            <button 
              onClick={() => supabase.auth.signOut()} 
              style={{ 
                padding: '4px 8px', 
                borderRadius: 5, 
                border: `1px solid ${C.border}`, 
                background: 'transparent', 
                color: C.muted, 
                cursor: 'pointer', 
                fontSize: 11 
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,display:sm?'flex':'none',overflowX:'auto',scrollbarWidth:'none'}}>
        {NAV_TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:'none',padding:'13px 12px',border:'none',background:'none',cursor:'pointer',color:tab===t.id?C.text:C.muted,borderBottom:`2px solid ${tab===t.id?C.purple:'transparent'}`,fontSize:12,fontWeight:tab===t.id?700:500,whiteSpace:'nowrap'}}>
            {t.label}
          </button>
        ))}
      </div>
      {sm && isAdmin && (
        <div style={{ padding: '8px 16px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>Viewing User:</span>
          <select
            value={viewingUserId || session.user.id}
            onChange={e => {
              const val = e.target.value;
              if (val === session.user.id) {
                setViewingUserId(null);
                setViewingUserEmail('');
              } else {
                setViewingUserId(val);
                const selectedUser = users.find(u => u.id === val);
                setViewingUserEmail(selectedUser ? selectedUser.email : '');
              }
            }}
            style={{
              background: C.bg,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: '4px 6px',
              fontSize: 11,
              flex: 1,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value={session.user.id}>Yourself ({session.user.email})</option>
            {users.filter(u => u.id !== session.user.id).map(u => (
              <option key={u.id} value={u.id}>
                {u.fullName ? `${u.fullName} (${u.email})` : u.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {sm&&<div style={{padding:'8px 16px 0',fontSize:13,fontWeight:600,color:C.muted}}>{TLBL[tab]}</div>}

      <div style={{padding:sm?'14px 14px 60px':'24px 28px 40px',maxWidth:sm?'none':1580,marginLeft:sm?0:250}}>
        {viewingUserId && (
          <div style={{
            background: `rgba(242, 167, 27, 0.15)`,
            border: `1px solid ${C.amber}66`,
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            color: C.amber,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <span>⚠️ VIEWING MODE: You are currently viewing and editing financial data for user <strong>{viewingUserEmail}</strong>.</span>
            <button
              onClick={() => {
                setViewingUserId(null);
                setViewingUserEmail('');
              }}
              style={{
                background: 'rgba(242, 167, 27, 0.2)',
                border: `1px solid ${C.amber}`,
                borderRadius: 5,
                color: C.text,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700
              }}
            >
              Exit View
            </button>
          </div>
        )}
        {(() => {
          const activePerm = getPermission(tab);
          const readOnly = activePerm === 'read';
          const canWrite = activePerm === 'write' || activePerm === 'update';
          const canUpdate = activePerm === 'update';

          // Expose to window global for Input and Button wrappers
          if (typeof window !== 'undefined') {
            window.activePermission = activePerm;
          }

          return (
            <>
              {tab==='dashboard'&&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm} session={session} setTab={setTab}/>}
              {tab==='history'  &&<HistoryTab budgetData={budgetData} sm={sm}/>}
              {tab==='budget'   &&<BudgetTab budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='accounts'       &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate} setTab={setTab}/>}
              {tab==='account-manager'&&<AccountManagerTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='reconcile'      &&<ReconcileTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='transactions'&&<TransactionsTab accounts={accounts} setAccounts={setAccounts} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='balancelog'  &&<BalanceLogTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='investments'&&<InvestmentsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='debts'     &&<DebtsTab debts={debts} setDebts={setDebts} accounts={accounts} setAccounts={setAccounts} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='credits'  &&<CreditsTab credits={credits} setCredits={setCredits} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='expenses' &&<MajorTab majorExpenses={majorExpenses} setMajorExpenses={setMajorExpenses} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='calendar'  &&<CalendarTab budgetData={budgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='graph'     &&<FinancialGraphTab budgetData={budgetData} accounts={accounts} debts={debts} majorExpenses={majorExpenses} credits={credits} sm={sm}/>}
              {tab==='reports'   &&<ReportTab budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm} session={session} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
            </>
          );
        })()}
        {tab==='admin'     &&<AdminTab sm={sm} users={users} setUsers={setUsers} adminConfigured={adminConfigured} fetchUsers={fetchUsers}/>}
      </div>
      {showProfileModal && <ProfileSettingsModal session={session} onClose={() => setShowProfileModal(false)} />}
    </div>
  );
}

// ─── PROFILE SETTINGS MODAL ──────────────────────────────────────────────────
function ProfileSettingsModal({ session, onClose }) {
  const meta = session?.user?.user_metadata || {};
  const [firstName, setFirstName] = useState(meta.first_name || '');
  const [lastName, setLastName] = useState(meta.last_name || '');
  const [email, setEmail] = useState(session?.user?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(meta.avatar_url || '');
  const [previewUrl, setPreviewUrl] = useState(meta.avatar_url || '');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);

  const initialLetter = ((firstName || meta.full_name || session?.user?.email || 'U').charAt(0)).toUpperCase();

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 256;
          const MAX_HEIGHT = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = err => reject(err);
      };
      reader.onerror = err => reject(err);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMsg({ text: 'Please select a valid image file (PNG, JPG, WEBP).', type: 'error' });
      return;
    }

    try {
      const compressedDataUrl = await compressImage(file);
      setPreviewUrl(compressedDataUrl);
      setFileToUpload(file);
      setMsg({ text: '', type: '' });
    } catch (err) {
      console.error("Image compression error:", err);
      setMsg({ text: 'Failed to process selected image file.', type: 'error' });
    }
  };

  const handleRemovePhoto = () => {
    setPreviewUrl('');
    setAvatarUrl('');
    setFileToUpload(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });

    try {
      let finalAvatarUrl = avatarUrl;

      // Handle Picture Upload
      if (fileToUpload || (previewUrl && previewUrl !== meta.avatar_url)) {
        if (previewUrl.startsWith('data:')) {
          // Attempt upload to Supabase Storage 'avatars' bucket
          try {
            const filePath = `${session.user.id}/avatar_${Date.now()}.jpg`;
            const { data: uploadRes, error: uploadErr } = await supabase.storage
              .from('avatars')
              .upload(filePath, fileToUpload, { upsert: true });

            if (!uploadErr && uploadRes) {
              const { data: pData } = supabase.storage.from('avatars').getPublicUrl(filePath);
              finalAvatarUrl = pData?.publicUrl || previewUrl;
            } else {
              // Fall back to compressed Base64 Data URL if bucket is unconfigured
              finalAvatarUrl = previewUrl;
            }
          } catch {
            finalAvatarUrl = previewUrl;
          }
        } else {
          finalAvatarUrl = previewUrl;
        }
      } else if (!previewUrl) {
        finalAvatarUrl = '';
      }

      const fullName = `${firstName} ${lastName}`.trim();
      const updates = {
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName || email.split('@')[0],
          avatar_url: finalAvatarUrl
        }
      };

      if (email && email !== session.user.email) {
        updates.email = email;
      }

      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;

      setMsg({ text: 'Profile updated successfully! Refreshing session...', type: 'success' });
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1200);
    } catch (err) {
      setMsg({ text: err.message || 'Failed to update profile.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 16
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '24px 28px', maxWidth: 440, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>👤 My Profile Settings</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {msg.text && (
          <div style={{
            padding: '10px 12px', borderRadius: 6, fontSize: 12, marginBottom: 16,
            background: msg.type === 'error' ? 'rgba(255, 81, 79, 0.15)' : 'rgba(63, 185, 80, 0.15)',
            border: `1px solid ${msg.type === 'error' ? C.red : C.green}`,
            color: msg.type === 'error' ? C.red : C.green
          }}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar Photo Picker Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: `${C.panel}66`, borderRadius: 10, border: `1px solid ${C.border}44` }}>
            <div 
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: previewUrl ? `url(${previewUrl}) center/cover no-repeat` : `linear-gradient(135deg, ${C.amber}, ${C.orange})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#08111f', fontWeight: 900, fontSize: 22,
                cursor: 'pointer', border: `2px solid ${C.purple}`, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                flexShrink: 0, position: 'relative'
              }}
              title="Click to change profile picture"
            >
              {!previewUrl && initialLetter}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Profile Picture</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.purple}`,
                    background: `${C.purple}22`, color: C.text, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📷 Upload Photo
                </button>
                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
                      background: 'transparent', color: C.muted, fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>First Name</label>
              <Inp value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Last Name</label>
              <Inp value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Email Address</label>
            <Inp type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Btn type="button" onClick={onClose}>Cancel</Btn>
            <BtnG type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</BtnG>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
function AdminTab({ sm, users, setUsers, adminConfigured, fetchUsers }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState("");
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  
  // Forms
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addFullName, setAddFullName] = useState("");
  const [resetPwd, setResetPwd] = useState("");

  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editPassword, setEditPassword] = useState("");

  // System Diagnostics states
  const [testResults, setTestResults] = useState({});
  const [testingModule, setTestingModule] = useState(null);
  const [testLogs, setTestLogs] = useState([]);
  const [loadingTestLogs, setLoadingTestLogs] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState(null);

  const fetchTestLogs = async () => {
    setLoadingTestLogs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin-tests", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.logs) {
        setTestLogs(data.logs);
      }
    } catch (err) {
      console.error("Error fetching test logs:", err);
    } finally {
      setLoadingTestLogs(false);
    }
  };

  const runTest = async (moduleName) => {
    setTestingModule(moduleName);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session.");
      const res = await fetch("/api/admin-tests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ module: moduleName })
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(prev => ({
          ...prev,
          ...data.results
        }));
        setActionSuccess(`Successfully ran test for '${moduleName}'!`);
        fetchTestLogs();
      } else {
        setError(data.error || "Failed to run tests.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingModule(null);
    }
  };

  const [rolePermissionsList, setRolePermissionsList] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const fetchRolePermissions = async () => {
    setLoadingPermissions(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin/permissions", {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      if (data.permissions) {
        setRolePermissionsList(data.permissions);
      }
    } catch (err) {
      console.error("Error fetching permissions:", err);
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId, role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user role");
      setActionSuccess(`Successfully updated user role to '${newRole}'`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleUserStatus = async (user) => {
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const newActive = user.isActive === false ? true : false;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ userId: user.id, role: user.role || 'user', isActive: newActive })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user status");
      setActionSuccess(`User status updated to ${newActive ? 'Active' : 'Inactive'} for ${user.email}`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePermission = async (roleName, moduleName, newAccessLevel) => {
    setLoadingPermissions(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ role: roleName, moduleName, accessLevel: newAccessLevel })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update permission");
      setRolePermissionsList(prev => {
        const index = prev.findIndex(p => p.role === roleName && p.module_name === moduleName);
        if (index > -1) {
          const next = [...prev];
          next[index] = data.permission;
          return next;
        }
        return [...prev, data.permission];
      });
      setActionSuccess(`Updated permission for role '${roleName}' on module '${moduleName}' to '${newAccessLevel}'`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPermissions(false);
    }
  };

  const getCellPermission = (roleName, moduleName) => {
    const entry = rolePermissionsList.find(p => p.role === roleName && p.module_name === moduleName);
    if (entry) return entry.access_level;
    if (roleName === "admin") return "update";
    if (roleName === "viewer") return "read";
    if (roleName === "guest") return moduleName === "dashboard" ? "read" : "none";
    return moduleName === "admin" ? "none" : "update";
  };

  useEffect(() => {
    if (isSupabaseConfigured) {
      const runInit = async () => {
        setLoading(true);
        try {
          await fetchUsers();
          await fetchTestLogs();
          await fetchRolePermissions();
        } catch (err) {
          console.error("Error initializing Admin tab data:", err);
        } finally {
          setLoading(false);
        }
      };
      runInit();
    }
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!addEmail || !addPassword) return;
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          email: addEmail,
          password: addPassword,
          fullName: addFullName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      
      setActionSuccess(`Successfully added user ${addEmail}`);
      setAddEmail("");
      setAddPassword("");
      setAddFullName("");
      setShowAddModal(false);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResetPwd(e) {
    e.preventDefault();
    if (!targetUser || !resetPwd) return;
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/users?id=${targetUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          password: resetPwd
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      
      setActionSuccess(`Password successfully updated for ${targetUser.email}`);
      setResetPwd("");
      setTargetUser(null);
      setShowPwdModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEditUser(e) {
    e.preventDefault();
    if (!targetUser) return;
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/users?id=${targetUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          fullName: editFullName,
          email: editEmail,
          role: editRole,
          password: editPassword || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      
      setActionSuccess(`Successfully updated user ${editEmail || targetUser.email}`);
      setShowEditModal(false);
      setTargetUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Are you absolutely sure you want to delete user ${user.email}?\nThis will remove them from Supabase auth and delete all of their budget data. This cannot be undone.`)) {
      return;
    }
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      
      setActionSuccess(`User ${user.email} has been deleted.`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <SecTitle>Admin Panel</SecTitle>
        <div style={{ color: C.amber, fontSize: 13 }}>
          Admin features are not available in Local Demo Mode. Please configure Supabase credentials in your <code>.env</code> file to enable this panel.
        </div>
      </Card>
    );
  }

  const filteredUsers = users.filter(u => {
    const term = search.toLowerCase();
    const emailMatch = (u.email || "").toLowerCase().includes(term);
    const nameMatch = (u.user_metadata?.full_name || "").toLowerCase().includes(term);
    return emailMatch || nameMatch;
  });

  const getAvatarColor = (id) => {
    const colors = [C.blue, C.green, C.purple, C.pink, C.orange, C.teal];
    if (!id) return colors[0];
    const index = id.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getInitials = (user) => {
    const name = user.user_metadata?.full_name || user.email || "U";
    return name.slice(0, 2).toUpperCase();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      {/* Metric Cards at the Top */}
      <div style={{ display: "grid", gridTemplateColumns: sm ? "1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <MetricCard label="Total Registered Users" value={users.length} color={C.blue} sm={sm} icon="👥" />
        <MetricCard label="Filtered Search Results" value={filteredUsers.length} color={C.purple} sm={sm} icon="🔍" />
        <MetricCard label="Service Role Status" value={adminConfigured ? "Active" : "Inactive"} color={adminConfigured ? C.green : C.red} sub={adminConfigured ? "Backend Access Ready" : "Missing credentials"} sm={sm} icon="🛡️" />
      </div>

      {/* Warning if service role key is missing */}
      {!adminConfigured && !loading && (
        <div style={{ background: "rgba(242, 167, 27, 0.1)", border: `1px solid ${C.amber}44`, borderRadius: 8, padding: 16, marginBottom: 14, color: C.amber, fontSize: 13, lineHeight: 1.5 }}>
          <strong>🛡️ Supabase Service Role Key Required:</strong>
          <div style={{ marginTop: 6 }}>
            To enable user management, you must configure the backend with your Supabase Service Role Key. 
            Add the following line to your local <code>.env</code> file and restart the server:
          </div>
          <pre style={{ background: "#08111f", padding: 8, borderRadius: 4, marginTop: 8, color: C.text, fontSize: 12 }}>
            SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
          </pre>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div style={{ background: "rgba(255, 81, 79, 0.1)", border: `1px solid ${C.red}44`, borderRadius: 8, padding: 12, marginBottom: 14, color: C.red, fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {actionSuccess && (
        <div style={{ background: "rgba(36, 209, 126, 0.1)", border: `1px solid ${C.green}44`, borderRadius: 8, padding: 12, marginBottom: 14, color: C.green, fontSize: 13 }}>
          <strong>Success:</strong> {actionSuccess}
        </div>
      )}

      {/* User Management Panel */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexDirection: sm ? "column" : "row" }}>
          <SecTitle style={{ margin: 0 }}>System User Management</SecTitle>
          <div style={{ display: "flex", gap: 8, width: sm ? "100%" : "auto" }}>
            <Inp 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search name or email..." 
              style={{ width: sm ? "100%" : 240, height: 35 }} 
              disabled={!adminConfigured}
            />
            <BtnG 
              onClick={() => { setActionSuccess(""); setError(""); setShowAddModal(true); }} 
              style={{ height: 35, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", opacity: adminConfigured ? 1 : 0.5 }}
              disabled={!adminConfigured}
            >
              + Add User
            </BtnG>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>
            Loading users from Supabase...
          </div>
        ) : !adminConfigured ? (
          <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>
            Please configure the Supabase Service Role Key to load the user directory.
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>
            {users.length === 0 ? "No users found in database." : "No users match your search criteria."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#08111f", borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "10px 8px", textAlign: "left", color: C.muted }}>User Info</th>
                  <th style={{ padding: "10px 8px", textAlign: "left", color: C.muted }}>Role</th>
                  <th style={{ padding: "10px 8px", textAlign: "center", color: C.muted }}>Status</th>
                  <th style={{ padding: "10px 8px", textAlign: "left", color: C.muted, display: sm ? "none" : "table-cell" }}>Created At</th>
                  <th style={{ padding: "10px 8px", textAlign: "left", color: C.muted, display: sm ? "none" : "table-cell" }}>Last Sign In</th>
                  <th style={{ padding: "10px 8px", textAlign: "center", color: C.muted }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const avClr = getAvatarColor(user.id);
                  const fullName = user.fullName || user.user_metadata?.full_name || "";
                  const userPic = user.user_metadata?.avatar_url || user.avatarUrl;
                  const isUserActive = user.isActive !== false;
                  return (
                    <tr key={user.id} style={{ borderBottom: `1px solid ${C.border}22`, transition: "background 0.2s" }}>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ 
                            width: 32, 
                            height: 32, 
                            borderRadius: "50%", 
                            background: userPic ? `url(${userPic}) center/cover no-repeat` : `${avClr}22`, 
                            border: `1px solid ${avClr}44`, 
                            color: avClr, 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            fontWeight: 700,
                            fontSize: 12,
                            flexShrink: 0
                          }}>
                            {!userPic && getInitials(user)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: C.text }}>{fullName || "No Name"}</div>
                            <div style={{ fontSize: 11, color: C.muted }}>{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <select
                          value={user.role || 'user'}
                          onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                          disabled={actionLoading}
                          style={{
                            background: C.bg,
                            color: C.text,
                            border: `1px solid ${C.border}`,
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer"
                          }}
                        >
                          <option value="admin">Admin</option>
                          <option value="user">User</option>
                          <option value="viewer">Viewer</option>
                          <option value="guest">Guest</option>
                        </select>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          disabled={actionLoading}
                          title="Click to toggle user activation status"
                          style={{
                            padding: '3px 9px',
                            borderRadius: 12,
                            border: `1px solid ${isUserActive ? C.green : C.red}`,
                            background: `${isUserActive ? C.green : C.red}22`,
                            color: isUserActive ? C.green : C.red,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          {isUserActive ? '● Active' : '○ Inactive'}
                        </button>
                      </td>
                      <td style={{ padding: "10px 8px", color: C.muted, display: sm ? "none" : "table-cell" }}>
                        {formatDate(user.created_at)}
                      </td>
                      <td style={{ padding: "10px 8px", color: C.muted, display: sm ? "none" : "table-cell" }}>
                        {formatDate(user.last_sign_in_at)}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <Btn 
                            onClick={() => {
                              setActionSuccess(""); 
                              setError("");
                              setTargetUser(user);
                              setEditFullName(user.user_metadata?.full_name || "");
                              setEditEmail(user.email || "");
                              setEditRole(user.user_metadata?.role || user.role || "user");
                              setEditPassword("");
                              setShowEditModal(true);
                            }}
                            style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${C.purple}44`, color: C.purple }}
                            disabled={actionLoading}
                          >
                            Edit
                          </Btn>
                          <Btn 
                            onClick={() => {
                              setActionSuccess(""); 
                              setError("");
                              setTargetUser(user);
                              setShowPwdModal(true);
                            }}
                            style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${C.blue}44`, color: C.blue }}
                            disabled={actionLoading}
                          >
                            Reset Pwd
                          </Btn>
                          <button 
                            onClick={() => handleDelete(user)} 
                            style={{ 
                              background: "none", 
                              border: `1px solid ${C.red}33`, 
                              borderRadius: 6, 
                              cursor: "pointer", 
                              color: C.red, 
                              padding: "4px 8px", 
                              fontSize: 11,
                              opacity: actionLoading ? 0.5 : 1
                            }}
                            disabled={actionLoading}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(2, 8, 20, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: 16
        }}>
          <Card style={{ width: "100%", maxWidth: 420, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SecTitle style={{ margin: 0 }}>Manually Add User</SecTitle>
              <button 
                onClick={() => setShowAddModal(false)} 
                style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Full Name</label>
                <Inp 
                  value={addFullName} 
                  onChange={e => setAddFullName(e.target.value)} 
                  placeholder="e.g. John Doe" 
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Email Address *</label>
                <Inp 
                  type="email"
                  value={addEmail} 
                  onChange={e => setAddEmail(e.target.value)} 
                  placeholder="name@example.com" 
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Password * (min 6 chars)</label>
                <Inp 
                  type="password"
                  value={addPassword} 
                  onChange={e => setAddPassword(e.target.value)} 
                  placeholder="••••••••" 
                  minLength={6}
                  required
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <BtnG type="submit" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? "Creating..." : "Create User"}
                </BtnG>
                <Btn type="button" onClick={() => setShowAddModal(false)} disabled={actionLoading}>
                  Cancel
                </Btn>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPwdModal && targetUser && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(2, 8, 20, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: 16
        }}>
          <Card style={{ width: "100%", maxWidth: 420, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SecTitle style={{ margin: 0 }}>Reset Password</SecTitle>
              <button 
                onClick={() => { setShowPwdModal(false); setTargetUser(null); }} 
                style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              Resetting password for: <strong style={{ color: C.text }}>{targetUser.email}</strong>
            </div>
            <form onSubmit={handleResetPwd} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>New Password (min 6 chars)</label>
                <Inp 
                  type="password"
                  value={resetPwd} 
                  onChange={e => setResetPwd(e.target.value)} 
                  placeholder="••••••••" 
                  minLength={6}
                  required
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <BtnG type="submit" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? "Updating..." : "Update Password"}
                </BtnG>
                <Btn type="button" onClick={() => { setShowPwdModal(false); setTargetUser(null); }} disabled={actionLoading}>
                  Cancel
                </Btn>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && targetUser && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(2, 8, 20, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: 16
        }}>
          <Card style={{ width: "100%", maxWidth: 450, marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SecTitle style={{ margin: 0 }}>Edit User Details</SecTitle>
              <button 
                onClick={() => { setShowEditModal(false); setTargetUser(null); }} 
                style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleEditUser} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Full Name</label>
                <Inp 
                  value={editFullName} 
                  onChange={e => setEditFullName(e.target.value)} 
                  placeholder="Full Name" 
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Email Address</label>
                <Inp 
                  type="email"
                  value={editEmail} 
                  onChange={e => setEditEmail(e.target.value)} 
                  placeholder="name@example.com" 
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>System Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  style={{
                    width: "100%",
                    background: C.bg,
                    color: C.text,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 13
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="viewer">Viewer</option>
                  <option value="guest">Guest</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>New Password (leave blank to keep current)</label>
                <Inp 
                  type="password"
                  value={editPassword} 
                  onChange={e => setEditPassword(e.target.value)} 
                  placeholder="••••••••" 
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <BtnG type="submit" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? "Saving..." : "Save Changes"}
                </BtnG>
                <Btn type="button" onClick={() => { setShowEditModal(false); setTargetUser(null); }} disabled={actionLoading}>
                  Cancel
                </Btn>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* System Diagnostics & Tests Card */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexDirection: sm ? "column" : "row", gap: 12 }}>
          <div>
            <SecTitle style={{ margin: 0 }}>🛡️ System Diagnostics & Testing</SecTitle>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Verify in-memory budget calculation logic, scheduler configurations, and MCP schemas.</div>
          </div>
          <BtnG 
            disabled={testingModule !== null} 
            onClick={() => runTest("all")}
            style={{ display: "flex", alignItems: "center", gap: 6, opacity: testingModule !== null ? 0.7 : 1, whiteSpace: "nowrap" }}
          >
            {testingModule === "all" ? "⏳ Running All..." : "🧪 Run All Tests"}
          </BtnG>
        </div>

        {/* Module States Grid */}
        <div style={{ display: "grid", gridTemplateColumns: sm ? "1fr" : "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { id: "dashboard", label: "Dashboard Module", icon: "📊" },
            { id: "history", label: "History Module", icon: "📋" },
            { id: "monthly", label: "Monthly Module", icon: "📅" },
            { id: "accounts", label: "Accounts Module", icon: "🏦" },
            { id: "investments", label: "Investments Module", icon: "📈" },
            { id: "debts", label: "Debt Module", icon: "💳" },
            { id: "credits", label: "Credits Module", icon: "🤝" },
            { id: "major", label: "Major Goals Module", icon: "🎯" },
            { id: "calendar", label: "Calendar Module", icon: "📅" },
            { id: "raw", label: "Raw Parser Module", icon: "📄" },
            { id: "mcp", label: "MCP Tools Schema", icon: "🤖" },
            { id: "scheduler", label: "Email Scheduler", icon: "⏰" }
          ].map(m => {
            const res = testResults[m.id];
            const isWorking = res?.status === "success";
            const isFailed = res?.status === "failure";
            const isTesting = testingModule === m.id;
            
            return (
              <div key={m.id} style={{
                padding: 10, borderRadius: 8, border: `1px solid ${C.border}`,
                background: `${C.panel}88`, display: "flex", flexDirection: "column",
                justifyContent: "space-between", gap: 8
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{m.label}</span>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: "uppercase",
                    padding: "2px 5px", borderRadius: 4,
                    background: isWorking ? `${C.green}22` : isFailed ? `${C.red}22` : `${C.muted}11`,
                    color: isWorking ? C.green : isFailed ? C.red : C.muted
                  }}>
                    {isTesting ? "Testing..." : isWorking ? "Working" : isFailed ? "Error" : "Untested"}
                  </span>
                </div>
                {res?.error && (
                  <div style={{ fontSize: 10, color: C.red, wordBreak: "break-all", fontFamily: "monospace" }}>
                    Error: {res.error}
                  </div>
                )}
                <button
                  disabled={testingModule !== null}
                  onClick={() => runTest(m.id)}
                  style={{
                    padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.border}`,
                    background: "transparent", color: C.text, fontSize: 10, fontWeight: 700,
                    cursor: testingModule !== null ? "wait" : "pointer", alignSelf: "flex-end"
                  }}
                >
                  {isTesting ? "⏳ Testing..." : "🧪 Test"}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Role Permissions Manager Card */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <SecTitle style={{ margin: 0 }}>🔑 Role Permissions Manager</SecTitle>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Configure access levels for each module per role. Changes are saved automatically.</div>
          </div>
          {loadingPermissions && <span style={{ fontSize: 12, color: C.muted }}>⏳ Saving...</span>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#08111f", borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "8px", textAlign: "left", color: C.muted }}>Module</th>
                <th style={{ padding: "8px", textAlign: "center", color: C.muted }}>Admin</th>
                <th style={{ padding: "8px", textAlign: "center", color: C.muted }}>User</th>
                <th style={{ padding: "8px", textAlign: "center", color: C.muted }}>Viewer</th>
                <th style={{ padding: "8px", textAlign: "center", color: C.muted }}>Guest</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: "dashboard", label: "Dashboard", icon: "📊" },
                { id: "history", label: "History Logs", icon: "📋" },
                { id: "budget", label: "Monthly Budget", icon: "📅" },
                { id: "accounts", label: "Accounts", icon: "🏦" },
                { id: "investments", label: "Investments", icon: "📈" },
                { id: "debts", label: "Debt Manager", icon: "💳" },
                { id: "credits", label: "Credits", icon: "🤝" },
                { id: "expenses", label: "Major Goals", icon: "🎯" },
                { id: "calendar", label: "Calendar Bills", icon: "📅" },
                { id: "reports", label: "Reports", icon: "📊" },
                { id: "admin", label: "Admin Panel", icon: "⚙️" }
              ].map(m => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>
                    {m.icon} {m.label}
                  </td>
                  {["admin", "user", "viewer", "guest"].map(roleName => {
                    const level = getCellPermission(roleName, m.id);
                    return (
                      <td key={roleName} style={{ padding: "8px", textAlign: "center" }}>
                        <select
                          value={level}
                          onChange={(e) => handleUpdatePermission(roleName, m.id, e.target.value)}
                          disabled={loadingPermissions || (roleName === "admin" && m.id === "admin")}
                          style={{
                            background: C.bg,
                            color: level === "none" ? C.red : level === "read" ? C.amber : level === "write" ? C.blue : C.green,
                            border: `1px solid ${C.border}`,
                            borderRadius: 4,
                            padding: "2px 4px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer"
                          }}
                        >
                          <option value="none">No Access</option>
                          <option value="read">Read-Only</option>
                          <option value="write">Write-Only</option>
                          <option value="update">Full Control</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* System Test Logs History */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <SecTitle style={{ margin: 0 }}>📜 System Test Logs</SecTitle>
          {loadingTestLogs && <span style={{ fontSize: 12, color: C.muted }}>⏳ Refreshing...</span>}
        </div>
        {testLogs.length === 0 ? (
          <div style={{ color: C.muted, padding: "16px 0", fontStyle: "italic", textAlign: "center" }}>
            No system test logs recorded yet. Run a test to log your first diagnostic check.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {testLogs.map(log => (
              <div key={log.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div 
                  onClick={() => setSelectedLogId(selectedLogId === log.id ? null : log.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 8, background: `${C.panel}66`,
                    borderLeft: `3px solid ${log.status === "success" ? C.green : C.red}`,
                    cursor: "pointer", border: `1px solid ${selectedLogId === log.id ? C.border : "transparent"}`
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 11, color: log.status === "success" ? C.green : C.red }}>
                      {log.status === "success" ? "✅ SUCCESS" : "❌ FAILED"}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Tested module: "{log.module_name}"</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{new Date(log.tested_at).toLocaleString()}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{selectedLogId === log.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {selectedLogId === log.id && (
                  <pre style={{
                    padding: 10, borderRadius: 8, background: `${C.bg}bb`, border: `1px solid ${C.border}`,
                    fontFamily: "monospace", fontSize: 11, color: C.muted, overflowX: "auto", margin: 0
                  }}>
                    {JSON.stringify(log.results, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

