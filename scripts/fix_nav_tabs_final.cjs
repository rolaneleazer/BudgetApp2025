const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

const oldTABS = `  const TABS=[
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

const newTABS = `  const TABS=[
    {id:'dashboard',   label:sm?'📊':'📊 Dashboard'},
    {id:'accounts',    label:sm?'🏦':'🏦 Accounts'},
    {id:'transactions',label:sm?'💸':'💸 Transactions'},
    {id:'balancelog',  label:sm?'📓':'📓 Balance Log'},
    {id:'budget',      label:sm?'📅':'📅 Monthly'},
    {id:'history',     label:sm?'📋':'📋 Budget History'},
    {id:'investments', label:sm?'📈':'📈 Investments'},
    {id:'debts',       label:sm?'💳':'💳 Debts'},
    {id:'credits',     label:sm?'🤝':'🤝 Credits'},
    {id:'expenses',    label:sm?'🎯':'🎯 Goals'},
    {id:'calendar',    label:sm?'🗓':'🗓 Bills'},
    {id:'graph',       label:sm?'🕸':'🕸 Graph'},
    {id:'reports',     label:sm?'📊':'📊 Reports'},
    ...(isAdmin ? [{id:'admin', label:sm?'⚙️':'⚙️ Admin Panel'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');`;

const oldTLBL = `  const TLBL={
    dashboard:'Dashboard',
    history:'History',
    budget:'Monthly Budget',
    accounts:'Accounts',
    investments:'Investments',
    debts:'Debt Manager',
    credits:'Credits (Money Owed)',
    expenses:'Major Expenses',
    calendar:'Financial Calendar',
    graph:'Financial Knowledge Graph',
    reports:'Financial Reports',
    admin:'Admin Panel'
  };`;

const newTLBL = `  const TLBL={
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
    graph:'Financial Knowledge Graph',
    reports:'Financial Reports',
    admin:'Admin Panel'
  };`;

const oldNAV = `  const NAV_TABS=[
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

const newNAV = `  const NAV_TABS=[
    {id:'dashboard',   label:'Dashboard',          icon:'📊',group:'main'},
    {id:'accounts',    label:'Accounts',           icon:'🏦',group:'manage'},
    {id:'transactions',label:'Transactions',       icon:'💸',group:'manage'},
    {id:'balancelog',  label:'Balance Log',        icon:'📓',group:'manage'},
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
  ].filter(t => getPermission(t.id) !== 'none');`;

if (src.includes(oldTABS)) {
  src = src.replace(oldTABS, newTABS);
  console.log('[OK] TABS updated');
} else {
  console.error('[ERROR] oldTABS pattern not found');
}

if (src.includes(oldTLBL)) {
  src = src.replace(oldTLBL, newTLBL);
  console.log('[OK] TLBL updated');
} else {
  console.error('[ERROR] oldTLBL pattern not found');
}

if (src.includes(oldNAV)) {
  src = src.replace(oldNAV, newNAV);
  console.log('[OK] NAV_TABS updated');
} else {
  console.error('[ERROR] oldNAV pattern not found');
}

fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done!');
