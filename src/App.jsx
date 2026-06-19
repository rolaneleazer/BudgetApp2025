import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, LineChart, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, ReferenceLine
} from "recharts";
import { supabase } from "./supabaseClient";
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
function makePeriod() {
  return {salary:27000, ot:{weekday:0,weekend:0}, expenses:EXPENSE_TPL.map(e=>({...e,done:false}))};
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

const peso = n=>'₱'+Math.abs(Math.round(n)).toLocaleString();
const fmtK = n=>n>=1000000?'₱'+(n/1e6).toFixed(2)+'M':n>=1000?'₱'+(n/1000).toFixed(0)+'k':peso(n);

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
const C={bg:'#0d1117',card:'#161b22',border:'#21262d',text:'#e6edf3',
  muted:'#7d8590',green:'#3fb950',red:'#f85149',amber:'#d29922',
  blue:'#388bfd',teal:'#56d364',purple:'#bc8cff',orange:'#f0883e'};
const ttip={background:C.card,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:11};

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Divider=()=><div style={{borderTop:`1px solid ${C.border}`,margin:'12px 0'}}/>;
const Tag=({children,color})=><span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:`${color}22`,color,fontWeight:600}}>{children}</span>;
const SecTitle=({children})=><div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>{children}</div>;
const Card=({children,style})=><div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:'16px 18px',marginBottom:14,...style}}>{children}</div>;
const Inp=({style,...p})=><input style={{background:'#0d1117',border:`1px solid ${C.border}`,borderRadius:6,padding:'8px 10px',color:C.text,fontSize:13,width:'100%',boxSizing:'border-box',...style}} {...p}/>;
const BtnG=({children,style,...p})=><button style={{padding:'8px 14px',borderRadius:7,border:`1px solid ${C.green}`,background:'rgba(63,185,80,0.15)',color:C.green,cursor:'pointer',fontSize:13,fontWeight:600,...style}} {...p}>{children}</button>;
const Btn=({children,style,...p})=><button style={{padding:'7px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:C.muted,cursor:'pointer',fontSize:13,...style}} {...p}>{children}</button>;

function MetricCard({label,value,sub,color,sm,masked,onToggleMask}) {
  return(
    <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:sm?'12px 14px':'16px 20px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:4}}>
        <div style={{fontSize:sm?11:12,color:C.muted}}>{label}</div>
        {onToggleMask&&(
          <button
            type="button"
            onClick={onToggleMask}
            title={masked?'Show amount':'Hide amount'}
            aria-label={masked?'Show amount':'Hide amount'}
            style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:masked?C.amber:C.muted,cursor:'pointer',fontSize:12,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}
          >
            {masked?'***':'$'}
          </button>
        )}
      </div>
      <div style={{fontSize:sm?17:22,fontWeight:700,color:color||C.text,lineHeight:1.2}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>}
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const DEFAULT_CARD_ORDER = ['metrics','balance-logs','cashflow','charts-row','budget-row','insights-row'];

function Dashboard({ budgetData, accounts, majorExpenses, credits, debts = DEF_DEBTS, balanceHistory, sm }) {
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

  // ── Per-section width: 'full' | 'half' ──
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
      case 'metrics': return (
        <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(7, 1fr)', gap: sm ? 8 : 12 }}>
          <MetricCard label="Net Worth" value={confidentialValue(fmtK(netWorth))} color={C.green} sm={sm} masked={moneyMasked} onToggleMask={toggleMoneyMask} />
          <MetricCard label="Monthly Savings" value={confidentialValue(fmtK(stats.reduce((sum, s) => sum + s.savings, 0)))} color={C.blue} sm={sm} masked={moneyMasked} onToggleMask={toggleMoneyMask} />
          <MetricCard label="Savings Rate" value={Math.round(avgRate) + '%'} color={avgRate >= 20 ? C.green : C.amber} sm={sm} />
          <MetricCard label="Emergency Fund" value={safetyMonths.toFixed(1) + ' Mo'} color={safetyMonths >= 6 ? C.green : safetyMonths >= 3 ? C.amber : C.red} sm={sm} />
          <MetricCard label="Debt Ratio" value={debtRatio.toFixed(0) + '%'} color={debtRatio <= 20 ? C.green : debtRatio <= 40 ? C.amber : C.red} sm={sm} />
          <MetricCard label="Upcoming Bills" value={upcomingBillsCount + ' Due'} color={upcomingBillsCount > 0 ? C.amber : C.muted} sm={sm} />
          <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: sm ? '12px 14px' : '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: sm ? 10 : 11, color: C.muted, marginBottom: 2 }}>Health Score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: sm ? 18 : 22, fontWeight: 800, color: grade.color }}>{healthScore}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: grade.color }}>{grade.label}</span>
            </div>
          </div>
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

      default: return null;
    }
  };

  const SECTION_LABELS = {
    'metrics': 'Key Metrics',
    'balance-logs': 'Balance Logs',
    'cashflow': 'Cash Flow',
    'charts-row': 'Charts',
    'budget-row': 'Budget & Goals',
    'insights-row': 'Insights',
  };

  return (
    <div>
      {/* Period toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted }}>Period:</span>
        {[
          ['current', 'Current Month'],
          ['12m', 'Last 12 Months'],
          ['2025', '2025'],
          ['2024', '2024'],
          ['custom', 'Custom Range']
        ].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} style={{ padding: '6px 12px', borderRadius: 14, border: `1px solid ${range === v ? C.green : C.border}`, background: range === v ? 'rgba(63,185,80,0.15)' : 'transparent', color: range === v ? C.green : C.muted, cursor: 'pointer', fontSize: 12 }}>
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
        {/* Reset layout button */}
        <button
          onClick={resetCardOrder}
          title="Reset dashboard layout to default"
          style={{ marginLeft: 'auto', padding: '5px 11px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          ↺ Reset Layout
        </button>
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
        Viewing: {range === 'custom' ? `${customStart} to ${customEnd}` : (keys.length > 0 ? `${displayKey(keys[0])} – ${displayKey(keys[keys.length - 1])}` : '')}
      </div>

      {/* ── Draggable sections ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {cardOrder.map(id => {
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
function BudgetTab({budgetData,setBudgetData,sm}) {
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
    setBudgetData(prev=>({...prev,[key]:{...(prev[key]||makeMonthData()),[period]:{...(prev[key]?.[period]||makePeriod()),...changes}}}));
  }
  function updOT(f,v){upd({ot:{...pData.ot,[f]:Number(v)||0}});}
  function updExp(i,f,v){const exp=[...pData.expenses];exp[i]={...exp[i],[f]:(f==='amount'||f==='budget')?(Number(v)||0):v};upd({expenses:exp});}

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
        <div style={{marginBottom:12}}><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Base Salary</div><Inp type="number" value={pData.salary} onChange={e=>upd({salary:Number(e.target.value)||0})}/></div>
        <Divider/>
        <SecTitle>Overtime Hours</SecTitle>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Weekday (₱750/hr)</div><Inp type="number" value={pData.ot.weekday} onChange={e=>updOT('weekday',e.target.value)}/></div>
          <div><div style={{fontSize:12,color:C.muted,marginBottom:5}}>Weekend (₱680/hr)</div><Inp type="number" value={pData.ot.weekend} onChange={e=>updOT('weekend',e.target.value)}/></div>
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
          <BtnG style={{padding:'6px 12px',fontSize:12}} onClick={()=>upd({expenses:[...pData.expenses,{name:'',budget:0,amount:0,done:false}]})}>+ Add</BtnG>
        </div>
        {pData.expenses.map((exp,i)=>(
          <div key={i} style={{padding:'8px 0',borderBottom:`1px solid ${C.border}22`}}>
            <div style={{display:'flex',gap:8,marginBottom:sm?6:0}}>
              <Inp value={exp.name} onChange={e=>updExp(i,'name',e.target.value)} placeholder="Item name" style={{flex:1,opacity:exp.done?0.5:1}}/>
              {!sm&&<div style={{display:'flex',gap:4}}>
                <Inp type="number" value={exp.budget ?? exp.amount ?? ''} onChange={e=>updExp(i,'budget',e.target.value)} placeholder="Budget" style={{width:90,textAlign:'right',opacity:exp.done?0.5:1}}/>
                <Inp type="number" value={exp.amount ?? ''} onChange={e=>updExp(i,'amount',e.target.value)} placeholder="Actual" style={{width:90,textAlign:'right',opacity:exp.done?0.5:1}}/>
              </div>}
              <button onClick={() => updExp(i, 'done', !exp.done)} style={{ minWidth: 40, background: 'none', border: `1px solid ${exp.done ? C.green : C.border}`, borderRadius: 6, cursor: 'pointer', color: exp.done ? C.green : C.muted, fontSize: 14, padding: '0 8px' }}>{exp.done ? '✓' : '—'}</button>
              <button onClick={() => upd({ expenses: pData.expenses.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
            </div>
            {sm && <div style={{display:'flex',gap:4,marginTop:4}}>
              <Inp type="number" value={exp.budget ?? exp.amount ?? ''} onChange={e => updExp(i, 'budget', e.target.value)} placeholder="Budget (₱)" style={{ opacity: exp.done ? 0.5 : 1 }} />
              <Inp type="number" value={exp.amount ?? ''} onChange={e => updExp(i, 'amount', e.target.value)} placeholder="Actual (₱)" style={{ opacity: exp.done ? 0.5 : 1 }} />
            </div>}
          </div>
        ))}
        <Divider />
        {[['Paid', peso(summ.paidExpenses), C.green], ['Remaining', peso(summ.totalExpenses - summ.paidExpenses), C.amber]].map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span style={{ color: C.muted }}>{l}</span><span style={{ color: c }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyBetween: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 4 }}><span style={{ color: C.muted }}>Total</span><span style={{ color: C.red }}>{peso(summ.totalExpenses)}</span></div>
      </Card>
    </div>
  );
}

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
function AccountsTab({ accounts, setAccounts, balanceHistory, setBalanceHistory, sm }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(null);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const grouped = accounts.reduce((g, a) => { (g[a.type] = g[a.type] || []).push(a); return g; }, {});

  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logBalances, setLogBalances] = useState({});
  const [updateCurrent, setUpdateCurrent] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const existingLog = balanceHistory.find(h => h.date === logDate);
    if (existingLog) {
      setLogBalances(existingLog.balances);
    } else {
      const currentBals = {};
      accounts.forEach(acc => {
        currentBals[acc.id] = acc.balance;
      });
      setLogBalances(currentBals);
    }
  }, [logDate, balanceHistory, accounts]);

  const handleLogBalanceChange = (id, val) => {
    setLogBalances(prev => ({
      ...prev,
      [id]: val === '' ? '' : Number(val)
    }));
  };

  const handleSaveLog = () => {
    const newBalances = { ...logBalances };
    accounts.forEach(acc => {
      if (newBalances[acc.id] === undefined || newBalances[acc.id] === '') {
        newBalances[acc.id] = 0;
      } else {
        newBalances[acc.id] = Number(newBalances[acc.id]);
      }
    });

    setBalanceHistory(prev => {
      const existingIdx = prev.findIndex(h => h.date === logDate);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { date: logDate, balances: newBalances };
        return updated;
      } else {
        return [...prev, { date: logDate, balances: newBalances }];
      }
    });

    if (updateCurrent) {
      setAccounts(prev => prev.map(acc => ({
        ...acc,
        balance: newBalances[acc.id] ?? acc.balance
      })));
    }

    setSuccessMsg('Logged successfully!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  function startEdit(acc) {
    setEditData({ ...acc });
    setEditing(acc.id);
  }

  function saveEdit() {
    setAccounts(p => p.map(a => a.id === editing ? editData : a));
    setEditing(null);
    setEditData(null);
  }

  function addNew(type = 'Investment') {
    const id = 'acc-' + Date.now();
    const newItem = { id, name: 'New Account', balance: 0, type };
    setAccounts(p => [...p, newItem]);
    startEdit(newItem);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>Total Net Worth</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green }}>₱{total.toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <BtnG onClick={() => addNew('New Category')}>+ New Category</BtnG>
        </div>
        <datalist id="acc-types">
          {['Investment', 'Savings', 'Checking', 'Digital', ...new Set(accounts.map(a => a.type))].map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* Left Column: Logger & Recent Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Logger Card */}
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Log Account Balances</SecTitle>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 5 }}>Select Date</div>
              <Inp 
                type="date" 
                value={logDate} 
                onChange={e => setLogDate(e.target.value)} 
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {accounts.map(acc => (
                <div key={acc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                    {acc.name}
                  </span>
                  <Inp 
                    type="number" 
                    value={logBalances[acc.id] ?? ''} 
                    onChange={e => handleLogBalanceChange(acc.id, e.target.value)} 
                    style={{ width: 110, textAlign: 'right', padding: '6px 8px' }} 
                  />
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input 
                type="checkbox" 
                id="chk-update-curr" 
                checked={updateCurrent} 
                onChange={e => setUpdateCurrent(e.target.checked)} 
                style={{ accentColor: C.green, cursor: 'pointer' }}
              />
              <label htmlFor="chk-update-curr" style={{ fontSize: 11, color: C.muted, cursor: 'pointer', userSelect: 'none' }}>
                Update current account balances on save
              </label>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BtnG onClick={handleSaveLog} style={{ padding: '6px 12px', fontSize: 12 }}>Save Log</BtnG>
              {successMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{successMsg}</span>}
            </div>
          </Card>

          {/* Recent Logs Card */}
          <Card style={{ marginBottom: 0 }}>
            <SecTitle>Recent Balance Logs</SecTitle>
            {balanceHistory.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 12 }}>No logs recorded yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.muted }}>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '6px' }}>Total Assets</th>
                      <th style={{ textAlign: 'center', padding: '6px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...balanceHistory]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 5)
                      .map(log => {
                        const totAssets = Object.values(log.balances).reduce((sum, v) => sum + v, 0);
                        return (
                          <tr key={log.date} style={{ borderBottom: `1px solid ${C.border}22` }}>
                            <td style={{ padding: '8px 6px' }}>{log.date}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, color: C.green }}>{peso(totAssets)}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <button 
                                onClick={() => {
                                  setLogDate(log.date);
                                  setLogBalances({ ...log.balances });
                                }}
                                style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, padding: '2px 6px', cursor: 'pointer', marginRight: 6 }}
                              >
                                Load
                              </button>
                              <button 
                                onClick={() => {
                                  if (confirm(`Delete log for ${log.date}?`)) {
                                    setBalanceHistory(prev => prev.filter(h => h.date !== log.date));
                                  }
                                }}
                                style={{ background: 'none', border: `1px solid ${C.red}44`, borderRadius: 4, color: C.red, padding: '2px 6px', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
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

        {/* Right Column: Categories & Accounts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.entries(grouped).map(([type, accs]) => (
            <Card key={type} style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: TYPE_CLR[type] || C.muted, display: 'inline-block' }} />
                    <SecTitle style={{ margin: 0 }}>{type}</SecTitle>
                  </div>
                  <button title="Add to this category" onClick={() => addNew(type)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: '50%', color: C.muted, cursor: 'pointer', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>+</button>
                </div>
                <span style={{ color: TYPE_CLR[type] || C.muted, fontWeight: 700, fontSize: 14 }}>{peso(accs.reduce((s, a) => s + a.balance, 0))}</span>
              </div>
              {accs.map(acc => (
                <div key={acc.id} style={{ padding: '8px 0', borderTop: `1px solid ${C.border}22` }}>
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
                        <div style={{ fontSize: 14 }}>{acc.name}</div>
                        <Tag color={TYPE_CLR[acc.type] || C.muted}>{acc.type}</Tag>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{peso(acc.balance)}</span>
                        <Btn style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => startEdit(acc)}>Edit</Btn>
                        <button onClick={() => setAccounts(p => p.filter(a => a.id !== acc.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18 }}>×</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAJOR EXPENSES ───────────────────────────────────────────────────────────
function MajorTab({majorExpenses,setMajorExpenses,sm}) {
  const tot=majorExpenses.reduce((s,e)=>s+e.budget,0);
  const spent=majorExpenses.reduce((s,e)=>s+e.actual,0);
  function upd(id,f,v){setMajorExpenses(p=>p.map(e=>e.id===id?{...e,[f]:['budget','actual'].includes(f)?(Number(v)||0):v}:e));}
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
          <BtnG style={{padding:'6px 12px',fontSize:12}} onClick={()=>setMajorExpenses(p=>[...p,{id:Date.now(),name:'New Expense',budget:0,actual:0,done:false}])}>+ Add</BtnG>
        </div>
        {majorExpenses.map(e=>{
          const pct=e.budget>0?Math.min(100,Math.round(e.actual/e.budget*100)):0;
          return(
            <div key={e.id} style={{marginBottom:16,paddingBottom:16,borderBottom:`1px solid ${C.border}22`}}>
              <div style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
                <Inp value={e.name} onChange={ev=>upd(e.id,'name',ev.target.value)} style={{flex:1,opacity:e.done?0.5:1}}/>
                <button onClick={()=>upd(e.id,'done',!e.done)} style={{minWidth:60,background:'none',border:`1px solid ${e.done?C.green:C.border}`,borderRadius:6,padding:'8px 6px',cursor:'pointer',color:e.done?C.green:C.muted,fontSize:11,whiteSpace:'nowrap'}}>{e.done?'✓ Done':'Pending'}</button>
                <button onClick={()=>setMajorExpenses(p=>p.filter(x=>x.id!==e.id))} style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:18}}>×</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Budget</div><Inp type="number" value={e.budget||''} onChange={ev=>upd(e.id,'budget',ev.target.value)} placeholder="0" style={{textAlign:'right'}}/></div>
                <div><div style={{fontSize:11,color:C.muted,marginBottom:4}}>Actual Spent</div><Inp type="number" value={e.actual||''} onChange={ev=>upd(e.id,'actual',ev.target.value)} placeholder="0" style={{textAlign:'right'}}/></div>
              </div>
              <div style={{background:C.border,borderRadius:4,height:5}}><div style={{width:`${pct}%`,height:'100%',background:e.done?C.green:pct>90?C.red:C.amber,borderRadius:4}}/></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginTop:3}}><span>{peso(e.actual)} spent</span><span>{pct}% of {peso(e.budget)}</span></div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─── CREDITS ──────────────────────────────────────────────────────────────────
function CreditsTab({ credits, setCredits, sm }) {
  const tot = credits.filter(c => !c.done).reduce((s, c) => s + c.amount, 0);
  const collected = credits.filter(c => c.done).reduce((s, c) => s + c.amount, 0);
  function upd(id, f, v) { setCredits(p => p.map(c => c.id === id ? { ...c, [f]: f === 'amount' ? (Number(v) || 0) : v } : c)); }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: sm ? 8 : 12, marginBottom: 14 }}>
        <MetricCard label="Total Owed" value={fmtK(tot)} color={C.amber} sm={sm} />
        <MetricCard label="Collected" value={fmtK(collected)} color={C.green} sm={sm} />
      </div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SecTitle>Money Owed to Me</SecTitle>
          <BtnG style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setCredits(p => [...p, { id: Date.now(), name: 'New Person', amount: 0, done: false }])}>+ Add Credit</BtnG>
        </div>
        {credits.map(c => (
          <div key={c.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}22` }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Inp value={c.name} onChange={ev => upd(c.id, 'name', ev.target.value)} style={{ flex: 1, opacity: c.done ? 0.5 : 1 }} placeholder="Who owes you?" />
              <button onClick={() => upd(c.id, 'done', !c.done)} style={{ minWidth: 80, background: 'none', border: `1px solid ${c.done ? C.green : C.border}`, borderRadius: 6, padding: '8px 6px', cursor: 'pointer', color: c.done ? C.green : C.muted, fontSize: 11, whiteSpace: 'nowrap' }}>{c.done ? '✓ Paid' : 'Pending'}</button>
              <button onClick={() => setCredits(p => p.filter(x => x.id !== c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Amount</div><Inp type="number" value={c.amount || ''} onChange={ev => upd(c.id, 'amount', ev.target.value)} placeholder="0" /></div>
            </div>
          </div>
        ))}
        {credits.length === 0 && <div style={{ textAlign: 'center', color: C.muted, padding: '20px 0', fontSize: 14 }}>No credits listed yet.</div>}
      </Card>
    </div>
  );
}

// ─── INVESTMENTS ──────────────────────────────────────────────────────────────
function InvestmentsTab({ accounts, setAccounts, sm }) {
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
          <BtnG onClick={() => {
            const id = 'acc-' + Date.now();
            const newItem = { id, name: 'New Investment Asset', balance: 0, type: 'Investment' };
            setAccounts(p => [...p, newItem]);
            startEdit(newItem);
          }}>+ Add Asset</BtnG>
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
                    <td style={{ padding: '6px' }}><Inp value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} /></td>
                    <td style={{ padding: '6px' }}><Inp type="number" value={editData.balance} onChange={e => setEditData({ ...editData, balance: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
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
                      <button onClick={() => startEdit(inv)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer', color: C.muted, padding: '2px 8px', fontSize: 11, marginRight: 4 }}>Edit</button>
                      <button onClick={() => setAccounts(p => p.filter(x => x.id !== inv.id))} style={{ background: 'none', border: `1px solid ${C.red}33`, borderRadius: 4, cursor: 'pointer', color: C.red, padding: '2px 8px', fontSize: 11 }}>Delete</button>
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
function DebtsTab({ debts, setDebts, sm }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState(null);

  const totalOwed = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalLimit = debts.reduce((sum, d) => sum + d.limit, 0);
  const avgUtilization = totalLimit > 0 ? (totalOwed / totalLimit) * 100 : 0;

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
          <BtnG onClick={addNew}>+ Add Debt Account</BtnG>
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
                      <td style={{ padding: '6px' }}><Inp value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} /></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.balance} onChange={e => setEditData({ ...editData, balance: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.limit} onChange={e => setEditData({ ...editData, limit: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.apr} onChange={e => setEditData({ ...editData, apr: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '6px' }}><Inp type="number" value={editData.minPayment} onChange={e => setEditData({ ...editData, minPayment: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} /></td>
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
                        <button onClick={() => startEdit(d)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer', color: C.muted, padding: '2px 8px', fontSize: 11, marginRight: 4 }}>Edit</button>
                        <button onClick={() => setDebts(p => p.filter(x => x.id !== d.id))} style={{ background: 'none', border: `1px solid ${C.red}33`, borderRadius: 4, cursor: 'pointer', color: C.red, padding: '2px 8px', fontSize: 11 }}>Delete</button>
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

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const width=useWidth();
  const sm=width<640;
  const [tab,setTab]=useState('dashboard');
  const [loaded,setLoaded]=useState(false);
  const [budgetData,setBudgetData]=useState({});
  const [accounts,setAccounts]=useState(DEF_ACCOUNTS);
  const [majorExpenses,setMajorExpenses]=useState(DEF_MAJOR);
  const [credits, setCredits] = useState([]);
  const [debts, setDebts] = useState(DEF_DEBTS);
  const [balanceHistory, setBalanceHistory] = useState([]);

  // Supabase Auth and Sync States
  const [session, setSession] = useState(null);
  const [syncStatus, setSyncStatus] = useState('saved');

  // Ref to prevent saving before initial load completes
  const ready=useRef(false);

  // Monitor Authentication Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data on session change
  useEffect(() => {
    if (!session) {
      ready.current = false;
      setLoaded(false);
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

        if (data) {
          setBudgetData(data.budget_data || {});
          setAccounts(data.accounts || DEF_ACCOUNTS);
          setMajorExpenses(data.major_expenses || DEF_MAJOR);
          setCredits(data.credits || []);
          setDebts(data.debts || DEF_DEBTS);
          setBalanceHistory(data.balance_history || []);
        } else {
          // No cloud data yet (first login).
          // Attempt migration from local storage fallback.
          const bd = await safeGet('bujdet-v2-budgetData');
          const acc = await safeGet('bujdet-accounts');
          const me = await safeGet('bujdet-majorExpenses');
          const cr = await safeGet('bujdet-credits');
          const db = await safeGet('bujdet-debts');
          const bh = await safeGet('bujdet-balanceHistory');

          const initialBudget = bd && Object.keys(bd).length > 0 ? bd : {};
          const initialAccounts = acc || DEF_ACCOUNTS;
          const initialMajor = me || DEF_MAJOR;
          const initialCredits = cr || [];
          const initialDebts = db || DEF_DEBTS;
          const initialHistory = (bh && bh.length > 0) ? bh : generateMockBalanceHistory(initialAccounts);

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
  }, [session]);

  // Debounced Cloud Sync to Supabase
  useEffect(() => {
    if (!ready.current || !session) return;

    setSyncStatus('syncing');
    const timer = setTimeout(async () => {
      try {
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
        setSyncStatus('saved');
      } catch (err) {
        console.error('Error syncing budget data to cloud:', err);
        setSyncStatus('error');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [budgetData, accounts, majorExpenses, credits, debts, balanceHistory, session]);

  // Keep local storage updated as a secondary fallback/offline cache
  useEffect(() => { if (ready.current) safeSet('bujdet-v2-budgetData', budgetData); }, [budgetData]);
  useEffect(() => { if (ready.current) safeSet('bujdet-accounts', accounts); }, [accounts]);
  useEffect(() => { if (ready.current) safeSet('bujdet-majorExpenses', majorExpenses); }, [majorExpenses]);
  useEffect(() => { if (ready.current) safeSet('bujdet-credits', credits); }, [credits]);
  useEffect(() => { if (ready.current) safeSet('bujdet-debts', debts); }, [debts]);
  useEffect(() => { if (ready.current) safeSet('bujdet-balanceHistory', balanceHistory); }, [balanceHistory]);

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
  ];
  const TLBL={
    dashboard:'Dashboard',
    history:'History',
    budget:'Monthly Budget',
    accounts:'Accounts',
    investments:'Investments',
    debts:'Debt Manager',
    credits:'Credits (Money Owed)',
    expenses:'Major Expenses',
    calendar:'Financial Calendar'
  };

  if (!session) {
    return <Auth />;
  }

  return (
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.text}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:sm?'0 16px':'0 24px',display:'flex',justifyContent:'space-between',alignItems:'center',height:sm?52:58}}>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <span style={{fontSize:sm?16:18,fontWeight:700,color:C.green}}>Bujdet</span>
          {!sm&&<span style={{fontSize:12,color:C.muted}}>Personal Budget Tracker</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: !loaded ? C.amber : syncStatus === 'saved' ? C.green : syncStatus === 'syncing' ? C.amber : C.red }}>
            {!loaded ? 'Loading…' : syncStatus === 'saved' ? '● Saved to Cloud' : syncStatus === 'syncing' ? '● Syncing...' : '● Sync Error'}
          </span>
          {!sm && <span style={{ fontSize: 12, color: C.muted }}>{session.user.email}</span>}
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
        </div>
      </div>

      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,display:'flex',overflowX:'auto',scrollbarWidth:'none'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:sm?1:'none',padding:sm?'13px 12px':'12px 18px',border:'none',background:'none',cursor:'pointer',color:tab===t.id?C.green:C.muted,borderBottom:`2px solid ${tab===t.id?C.green:'transparent'}`,fontSize:sm?16:13,fontWeight:tab===t.id?600:400,whiteSpace:'nowrap'}}>
            {t.label}
          </button>
        ))}
      </div>

      {sm&&<div style={{padding:'8px 16px 0',fontSize:13,fontWeight:600,color:C.muted}}>{TLBL[tab]}</div>}

      <div style={{padding:sm?'14px 14px 60px':'24px',maxWidth:980,margin:'0 auto'}}>
        {tab==='dashboard'&&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm}/>}
        {tab==='history'  &&<HistoryTab budgetData={budgetData} sm={sm}/>}
        {tab==='budget'   &&<BudgetTab budgetData={budgetData} setBudgetData={setBudgetData} sm={sm}/>}
        {tab==='accounts' &&<AccountsTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm}/>}
        {tab==='investments'&&<InvestmentsTab accounts={accounts} setAccounts={setAccounts} sm={sm}/>}
        {tab==='debts'     &&<DebtsTab debts={debts} setDebts={setDebts} sm={sm}/>}
        {tab==='credits'  &&<CreditsTab credits={credits} setCredits={setCredits} sm={sm}/>}
        {tab==='expenses' &&<MajorTab majorExpenses={majorExpenses} setMajorExpenses={setMajorExpenses} sm={sm}/>}
        {tab==='calendar'  &&<CalendarTab budgetData={budgetData} sm={sm}/>}
      </div>
    </div>
  );
}
