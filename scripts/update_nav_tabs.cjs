const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let lines = fs.readFileSync(SRC_PATH, 'utf8').split('\n');

const startIdx = lines.findIndex(l => l.includes('const NAV_TABS='));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('].filter(t => getPermission(t.id) !== \'none\');'));

console.log(`NAV_TABS found from line ${startIdx + 1} to ${endIdx + 1}`);

const newNavLines = [
  "  const NAV_TABS=[",
  "    {id:'dashboard',   label:'Dashboard',          icon:'📊',group:'main'},",
  "    {id:'accounts',    label:'Accounts',           icon:'🏦',group:'manage'},",
  "    {id:'transactions',label:'Transactions',       icon:'💸',group:'manage'},",
  "    {id:'balancelog',  label:'Balance Log',        icon:'📓',group:'manage'},",
  "    {id:'debts',       label:'Debts',              icon:'💳',group:'manage'},",
  "    {id:'credits',     label:'Credits (Owed to You)',icon:'🤝',group:'manage'},",
  "    {id:'expenses',    label:'Goals',              icon:'🎯',group:'manage'},",
  "    {id:'budget',      label:'Monthly Budget',     icon:'📅',group:'manage'},",
  "    {id:'history',     label:'Budget History',     icon:'📋',group:'manage'},",
  "    {id:'calendar',    label:'Bills',              icon:'🗓',group:'manage'},",
  "    {id:'investments', label:'Investments',        icon:'📈',group:'analytics'},",
  "    {id:'graph',       label:'Financial Graph',    icon:'🕸',group:'analytics'},",
  "    {id:'reports',     label:'Reports',            icon:'📊',group:'analytics'},",
  "    ...(isAdmin ? [{id:'admin', label:'Admin Panel',icon:'⚙️',group:'admin'}] : []),",
  "  ].filter(t => getPermission(t.id) !== 'none');"
];

lines.splice(startIdx, endIdx - startIdx + 1, ...newNavLines);

fs.writeFileSync(SRC_PATH, lines.join('\n'), 'utf8');
console.log('✅ NAV_TABS successfully updated with Financial Graph, Transactions, and Balance Log!');
