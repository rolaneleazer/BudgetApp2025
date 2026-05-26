import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, PieChart, Pie, Cell, AreaChart, Area, ComposedChart, ReferenceLine
} from "recharts";

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const OT_RATES = { weekday: 750, weekend: 680 };
const TAX_RATE = 0.20;
const NOW = new Date();
const CUR_YEAR  = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth();

const makeKey = (year, mi) => `${year}-${String(mi + 1).padStart(2, '0')}`;
const parseKey = k => { const [y,m] = k.split('-'); return { year: parseInt(y), monthIdx: parseInt(m)-1 }; };
const displayKey = k => { const {year,monthIdx} = parseKey(k); return `${MONTH_NAMES[monthIdx]} ${year}`; };
const shortKey   = k => { const {year,monthIdx} = parseKey(k); return `${MONTH_NAMES[monthIdx].slice(0,3)} ${String(year).slice(2)}`; };

const OLD_MAP = {
  'August':'2024-08','September':'2024-09','October':'2024-10','November':'2024-11',
  'December':'2024-12','January':'2025-01','February':'2025-02','March':'2025-03',
  'April':'2025-04','May':'2025-05','June':'2025-06','July':'2025-07',
};

const EXPENSE_TPL = [
  {name:'Rent',amount:18000},{name:'RCBC CC',amount:9400},{name:'RCBC Gold',amount:2200},
  {name:'RCBC Watch',amount:5000},{name:'SB CC',amount:0},{name:'Parents',amount:5000},
  {name:'Atome',amount:0},{name:'ZED',amount:0},{name:'Prulife',amount:2600},
  {name:'iPhone',amount:3200},{name:'Animals',amount:800},{name:'Gas',amount:2000},
  {name:'Toll',amount:1500},{name:'Electricity',amount:1000},{name:'Pagibig MP2',amount:2500},
  {name:'Laundry',amount:800},{name:'Grocery',amount:0},{name:'Food',amount:0},{name:'Other',amount:0},
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
  {id:1,name:'Parent Birthday',budget:60000,actual:0,done:false},
  {id:2,name:'Eisley Wedding',budget:60000,actual:0,done:false},
  {id:3,name:'Zed Wedding',budget:45000,actual:0,done:false},
  {id:4,name:'Papa Hospital',budget:172000,actual:0,done:true},
  {id:5,name:'Christmas Food',budget:38000,actual:38000,done:true},
  {id:6,name:'Christmas Gifts',budget:48000,actual:0,done:false},
  {id:7,name:'Omega Watch',budget:30000,actual:0,done:false},
  {id:8,name:'Birthday (Office)',budget:30000,actual:0,done:false},
  {id:9,name:'Japan Trip',budget:180000,actual:0,done:false},
];

const TYPE_CLR = {Investment:'#bc8cff',Savings:'#3fb950',Checking:'#388bfd',Digital:'#56d364'};

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

function MetricCard({label,value,sub,color,sm}) {
  return(
    <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,padding:sm?'12px 14px':'16px 20px'}}>
      <div style={{fontSize:sm?11:12,color:C.muted,marginBottom:4}}>{label}</div>
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
function Dashboard({ budgetData, accounts, majorExpenses, credits, sm }) {
  const [range, setRange] = useState('12m'); // '12m', '2025', '2024', 'custom'
  const [customStart, setCustomStart] = useState(makeKey(CUR_YEAR - 1, CUR_MONTH));
  const [customEnd, setCustomEnd] = useState(makeKey(CUR_YEAR, CUR_MONTH));

  const getKeys = () => {
    let s, e;
    if (range === '12m') {
      const d = new Date(CUR_YEAR, CUR_MONTH - 11, 1);
      s = makeKey(d.getFullYear(), d.getMonth());
      e = makeKey(CUR_YEAR, CUR_MONTH);
    } else if (range === '2025') {
      s = '2025-01'; e = '2025-12';
    } else if (range === '2024') {
      s = '2024-01'; e = '2024-12';
    } else {
      s = customStart; e = customEnd;
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
    const md = budgetData[key];
    const mt = md ? calcMonth(md) : { income: 0, expenses: 0, savings: 0, otIncome: 0, otHours: 0, savingsRate: 0 };
    return { key, label: shortKey(key), ...mt };
  });
  let run = 0;
  const cum = stats.map(s => { run += s.savings; return { ...s, cum: Math.round(run / 1000) }; });
  const totalBal = accounts.reduce((s, a) => s + a.balance, 0);
  const totalCredits = credits.filter(c => !c.done).reduce((s, c) => s + c.amount, 0);
  const netWorth = totalBal + totalCredits;
  const active = stats.filter(s => s.income > 0);

  const avgExp = active.length ? active.reduce((s, m) => s + m.expenses, 0) / active.length : 0;
  const avgSav = active.length ? active.reduce((s, m) => s + m.savings, 0) / active.length : 0;
  const liquid = accounts.filter(a => ['Savings', 'Checking', 'Digital'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
  const safetyMonths = avgExp > 0 ? liquid / avgExp : 0;

  const forecast = [];
  for (let i = 0; i <= 12; i++) {
    forecast.push({
      label: i === 0 ? 'Now' : `+${i}m`,
      val: Math.round((netWorth + (avgSav * i)) / 1000)
    });
  }

  const avgRate = active.length ? active.reduce((s, m) => s + m.savingsRate, 0) / active.length : 0;
  const best=active.length?[...active].sort((a,b)=>b.savings-a.savings)[0]:null;
  const totOTH=stats.reduce((s,m)=>s+m.otHours,0);
  const totOTI=stats.reduce((s,m)=>s+m.otIncome,0);
  const majorBudget=majorExpenses.reduce((s,e)=>s+e.budget,0);
  const majorSpent=majorExpenses.reduce((s,e)=>s+e.actual,0);
  const expTot={};
  Object.values(budgetData).forEach(md=>['5th','20th'].forEach(p=>(md?.[p]?.expenses||[]).forEach(e=>{if(e.name&&e.amount>0)expTot[e.name]=(expTot[e.name]||0)+Number(e.amount);})));
  const topExp=Object.entries(expTot).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const expClr=[C.red,C.orange,C.amber,C.purple,C.blue,C.teal];
  const pieData=accounts.map(a=>({name:a.name,value:a.balance,color:TYPE_CLR[a.type]||C.muted}));
  const ch=sm?180:230, sch=sm?155:195;
  const g2={display:'grid',gridTemplateColumns:sm?'1fr':'3fr 2fr',gap:12};

  return(
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.muted }}>Period:</span>
        {[
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <select value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '4px', fontSize: 11 }}>
              {keys.map(k => <option key={k} value={k}>{displayKey(k)}</option>)}
              {/* Fallback for picker options if keys is small */}
              {['2024-01', '2024-06', '2025-01', '2025-06'].map(k => !keys.includes(k) && <option key={k} value={k}>{displayKey(k)}</option>)}
            </select>
            <span style={{ color: C.muted }}>to</span>
            <select value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '4px', fontSize: 11 }}>
              {['2024-01', '2024-06', '2025-01', '2025-06', '2025-12'].map(k => <option key={k} value={k}>{displayKey(k)}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Viewing: {displayKey(keys[0])} – {displayKey(keys[keys.length - 1])}</div>
      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr 1fr' : 'repeat(6, 1fr)', gap: sm ? 8 : 12, marginBottom: 14 }}>
        <MetricCard label="Net Worth" value={fmtK(netWorth)} color={C.green} sm={sm} />
        <MetricCard label="Safety Months" value={safetyMonths.toFixed(1)} color={safetyMonths >= 6 ? C.green : safetyMonths >= 3 ? C.amber : C.red} sub="Emergency Fund" sm={sm} />
        <MetricCard label="Owed to Me" value={fmtK(totalCredits)} color={C.amber} sub="credits" sm={sm} />
        <MetricCard label="Avg Savings" value={Math.round(avgRate) + '%'} color={avgRate >= 20 ? C.green : C.amber} sub="rate" sm={sm} />
        <MetricCard label="Best Month" value={best ? best.label : '—'} color={C.blue} sub={best ? '+' + fmtK(best.savings) : 'no data'} sm={sm} />
        <MetricCard label="Total OT OTI" value={fmtK(totOTI)} color={C.purple} sub={totOTH + ' hrs'} sm={sm} />
      </div>

      <Card>
        <SecTitle>Monthly Income vs Expenses vs Savings (₱k)</SecTitle>
        <ResponsiveContainer width="100%" height={ch}>
          <ComposedChart data={stats} margin={{top:5,right:5,left:sm?-20:-15,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
            <XAxis dataKey="label" tick={{fill:C.muted,fontSize:sm?8:10}}/>
            <YAxis tick={{fill:C.muted,fontSize:sm?9:11}} tickFormatter={v=>`${v}k`}/>
            <Tooltip contentStyle={ttip} formatter={(v,n)=>[`₱${v}k`,n]}/>
            <Bar dataKey={d=>Math.round(d.income/1000)} name="Income" fill={C.blue} radius={[3,3,0,0]}/>
            <Bar dataKey={d=>Math.round(d.expenses/1000)} name="Expenses" fill={C.red} radius={[3,3,0,0]}/>
            <Line type="monotone" dataKey={d=>Math.round(d.savings/1000)} name="Savings" stroke={C.green} strokeWidth={2} dot={{fill:C.green,r:3}}/>
          </ComposedChart>
        </ResponsiveContainer>
        <Legend items={[['Income',C.blue],['Expenses',C.red],['Savings',C.green]]}/>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>Cumulative Savings (₱k)</SecTitle>
          <ResponsiveContainer width="100%" height={sch}>
            <AreaChart data={cum} margin={{ top: 5, right: 5, left: sm ? -20 : -15, bottom: 0 }}>
              <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.3} /><stop offset="95%" stopColor={C.green} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: sm ? 8 : 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: sm ? 9 : 11 }} tickFormatter={v => `${v}k`} />
              <Tooltip contentStyle={ttip} formatter={v => [`₱${v}k`, 'Cumulative']} />
              <Area type="monotone" dataKey="cum" stroke={C.green} fill="url(#cg)" strokeWidth={2} dot={{ fill: C.green, r: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
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

      <div style={{display:'grid',gridTemplateColumns:sm?'1fr':'1fr 1fr',gap:12}}>
        <Card style={{marginBottom:0}}>
          <SecTitle>Top Expense Categories (All-Time)</SecTitle>
          {topExp.length===0&&<div style={{color:C.muted,fontSize:13}}>Add data in Monthly Budget.</div>}
          {topExp.map(([name,total],i)=>(
            <div key={name} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                <span>{name}</span><span style={{color:expClr[i],fontWeight:600}}>{fmtK(total)}</span>
              </div>
              <div style={{background:C.border,borderRadius:4,height:5}}>
                <div style={{width:`${Math.round((total/(topExp[0]?.[1]||1))*100)}%`,height:'100%',background:expClr[i],borderRadius:4}}/>
              </div>
            </div>
          ))}
        </Card>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Card style={{marginBottom:0}}>
            <SecTitle>Net Worth Breakdown</SecTitle>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <ResponsiveContainer width={110} height={110}>
                <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>{pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Pie><Tooltip contentStyle={ttip} formatter={v=>peso(v)}/></PieChart>
              </ResponsiveContainer>
              <div style={{flex:1}}>
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
          <Card style={{marginBottom:0}}>
            <SecTitle>Major Expenses</SecTitle>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>Budget</span><span style={{color:C.amber,fontWeight:600}}>{fmtK(majorBudget)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:8}}><span style={{color:C.muted}}>Spent</span><span style={{color:C.red,fontWeight:600}}>{fmtK(majorSpent)}</span></div>
            <div style={{background:C.border,borderRadius:4,height:6}}><div style={{width:`${Math.min(100,Math.round(majorSpent/majorBudget*100))||0}%`,height:'100%',background:C.amber,borderRadius:4}}/></div>
            <div style={{fontSize:11,color:C.muted,textAlign:'right',marginTop:3}}>{Math.round(majorSpent/majorBudget*100)||0}% used</div>
          </Card>
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
  function updExp(i,f,v){const exp=[...pData.expenses];exp[i]={...exp[i],[f]:f==='amount'?(Number(v)||0):v};upd({expenses:exp});}

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
          <BtnG style={{padding:'6px 12px',fontSize:12}} onClick={()=>upd({expenses:[...pData.expenses,{name:'',amount:0,done:false}]})}>+ Add</BtnG>
        </div>
        {pData.expenses.map((exp,i)=>(
          <div key={i} style={{padding:'8px 0',borderBottom:`1px solid ${C.border}22`}}>
            <div style={{display:'flex',gap:8,marginBottom:sm?6:0}}>
              <Inp value={exp.name} onChange={e=>updExp(i,'name',e.target.value)} placeholder="Item name" style={{flex:1,opacity:exp.done?0.5:1}}/>
              {!sm&&<Inp type="number" value={exp.amount||''} onChange={e=>updExp(i,'amount',e.target.value)} placeholder="0" style={{width:110,textAlign:'right',opacity:exp.done?0.5:1}}/>}
              <button onClick={() => updExp(i, 'done', !exp.done)} style={{ minWidth: 40, background: 'none', border: `1px solid ${exp.done ? C.green : C.border}`, borderRadius: 6, cursor: 'pointer', color: exp.done ? C.green : C.muted, fontSize: 14, padding: '0 8px' }}>{exp.done ? '✓' : '—'}</button>
              <button onClick={() => upd({ expenses: pData.expenses.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 18, padding: '0 4px' }}>×</button>
            </div>
            {sm && <Inp type="number" value={exp.amount || ''} onChange={e => updExp(i, 'amount', e.target.value)} placeholder="Amount (₱)" style={{ opacity: exp.done ? 0.5 : 1 }} />}
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
function AccountsTab({ accounts, setAccounts, sm }) {
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
      {Object.entries(grouped).map(([type, accs]) => (
        <Card key={type}>
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

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const width=useWidth();
  const sm=width<640;
  const [tab,setTab]=useState('budget');
  const [loaded,setLoaded]=useState(false);
  const [budgetData,setBudgetData]=useState({});
  const [accounts,setAccounts]=useState(DEF_ACCOUNTS);
  const [majorExpenses,setMajorExpenses]=useState(DEF_MAJOR);
  const [credits, setCredits] = useState([]);

  // Ref to prevent saving before initial load completes
  const ready=useRef(false);

  useEffect(()=>{
    async function load(){
      // ✅ Each key wrapped separately — one missing key won't block the others
      const bd=await safeGet('bujdet-v2-budgetData');
      if(bd && Object.keys(bd).length>0){
        setBudgetData(bd);
      } else {
        // Try migrating old format
        const old=await safeGet('bujdet-budgetData');
        if(old){
          const migrated={};
          Object.entries(old).forEach(([k,v])=>{migrated[OLD_MAP[k]||k]=v;});
          setBudgetData(migrated);
        }
      }
      const acc=await safeGet('bujdet-accounts');
      if(acc) setAccounts(acc);
      const me=await safeGet('bujdet-majorExpenses');
      if(me) setMajorExpenses(me);
      const cr = await safeGet('bujdet-credits');
      if (cr) setCredits(cr);

      // ✅ Only allow saves AFTER loading is done
      ready.current=true;
      setLoaded(true);
    }
    load();
  },[]);

  // ✅ Save only after ready — prevents overwriting storage with initial empty state
  useEffect(()=>{if(ready.current) safeSet('bujdet-v2-budgetData',budgetData);},[budgetData]);
  useEffect(()=>{if(ready.current) safeSet('bujdet-accounts',accounts);},[accounts]);
  useEffect(()=>{if(ready.current) safeSet('bujdet-majorExpenses',majorExpenses);},[majorExpenses]);
  useEffect(() => { if (ready.current) safeSet('bujdet-credits', credits); }, [credits]);

  const TABS=[
    {id:'dashboard',label:sm?'📊':'📊 Dashboard'},
    {id:'history',  label:sm?'📋':'📋 History'},
    {id:'budget',   label:sm?'📅':'📅 Monthly'},
    {id:'accounts', label:sm?'🏦':'🏦 Accounts'},
    {id:'credits',  label:sm?'🤝':'🤝 Credits'},
    {id:'expenses', label:sm?'🎯':'🎯 Major'},
  ];
  const TLBL={dashboard:'Dashboard',history:'History',budget:'Monthly Budget',accounts:'Accounts',credits:'Credits (Money Owed)',expenses:'Major Expenses'};

  return(
    <div style={{background:C.bg,minHeight:'100vh',fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.text}}>
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:sm?'0 16px':'0 24px',display:'flex',justifyContent:'space-between',alignItems:'center',height:sm?52:58}}>
        <div style={{display:'flex',alignItems:'baseline',gap:6}}>
          <span style={{fontSize:sm?16:18,fontWeight:700,color:C.green}}>Bujdet</span>
          {!sm&&<span style={{fontSize:12,color:C.muted}}>Personal Budget Tracker</span>}
        </div>
        <span style={{fontSize:11,color:loaded?C.green:C.amber}}>{loaded?'● Saved':'Loading…'}</span>
      </div>

      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,display:'flex'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:sm?1:'none',padding:sm?'13px 0':'12px 18px',border:'none',background:'none',cursor:'pointer',color:tab===t.id?C.green:C.muted,borderBottom:`2px solid ${tab===t.id?C.green:'transparent'}`,fontSize:sm?18:13,fontWeight:tab===t.id?600:400,whiteSpace:'nowrap'}}>
            {t.label}
          </button>
        ))}
      </div>

      {sm&&<div style={{padding:'8px 16px 0',fontSize:13,fontWeight:600,color:C.muted}}>{TLBL[tab]}</div>}

      <div style={{padding:sm?'14px 14px 60px':'24px',maxWidth:980,margin:'0 auto'}}>
        {tab==='dashboard'&&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} sm={sm}/>}
        {tab==='history'  &&<HistoryTab budgetData={budgetData} sm={sm}/>}
        {tab==='budget'   &&<BudgetTab budgetData={budgetData} setBudgetData={setBudgetData} sm={sm}/>}
        {tab==='accounts' &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm}/>}
        {tab==='credits'  &&<CreditsTab credits={credits} setCredits={setCredits} sm={sm}/>}
        {tab==='expenses' &&<MajorTab majorExpenses={majorExpenses} setMajorExpenses={setMajorExpenses} sm={sm}/>}
      </div>
    </div>
  );
}
