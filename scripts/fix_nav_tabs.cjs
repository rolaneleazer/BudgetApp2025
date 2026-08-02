const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'App.jsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Clean up duplicate insert inside loadCloudData
const badBlockStart = content.indexOf('const TABS=[\n            {id:\'dashboard\'');
if (badBlockStart !== -1) {
  const badBlockEnd = content.indexOf('].filter(t => getPermission(t.id) !== \'none\');\n\n          const initialHistory', badBlockStart);
  if (badBlockEnd !== -1) {
    const fullBadBlock = content.slice(badBlockStart, badBlockEnd + '].filter(t => getPermission(t.id) !== \'none\');\n\n'.length);
    content = content.replace(fullBadBlock, '');
    console.log('[OK] Removed bad block inside loadCloudData');
  }
}

// 2. Find the REAL NAV_TABS right before navGroups
const targetStr = `  const NAV_TABS=[
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

const newNAVBlock = `  const TABS=[
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
    {id:'reports',     label:sm?'📊':'📊 Reports'},
    ...(isAdmin ? [{id:'admin', label:sm?'⚙️':'⚙️ Admin Panel'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');

  const TLBL={
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
  };

  const NAV_TABS=[
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
    {id:'reports',     label:'Reports',            icon:'📊',group:'analytics'},
    ...(isAdmin ? [{id:'admin', label:'Admin Panel',icon:'⚙️',group:'admin'}] : []),
  ].filter(t => getPermission(t.id) !== 'none');`;

// Also find old TABS and TLBL and replace them
const oldTABS = content.slice(content.indexOf('  const TABS=['), content.indexOf('  const navGroups = ['));
if (oldTABS) {
  content = content.replace(oldTABS, newNAVBlock + '\n\n');
  console.log('[OK] Replaced TABS/TLBL/NAV_TABS cleanly');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done!');
