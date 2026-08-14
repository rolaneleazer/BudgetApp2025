// fix_router.cjs — Updates the tab router to add TransactionsTab + BalanceLogTab routes
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC, 'utf8');

// Build the old router block by assembling what we know is in the file
const OLD_DASHBOARD = "tab==='dashboard'&&<Dashboard budgetData={budgetData}";
const OLD_ACCOUNTS  = "tab==='accounts' &&<AccountsTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>";

// Strategy: insert new routes after the dashboard line, and remove the old accounts line
// Step 1: insert transactions + balancelog after dashboard line
const dashboardLine  = "              {tab==='dashboard'&&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm}/>}";
const insertAfterDashboard = "\n              {tab==='accounts'    &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}\n              {tab==='transactions'&&<TransactionsTab accounts={accounts} setAccounts={setAccounts} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}\n              {tab==='balancelog'  &&<BalanceLogTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm} canWrite={canWrite} canUpdate={canUpdate}/>}";

if (src.includes(dashboardLine)) {
  src = src.replace(dashboardLine, dashboardLine + insertAfterDashboard);
  console.log('[OK] Inserted transactions + balancelog routes after dashboard');
} else {
  console.error('[ERROR] dashboard route line not found');
  process.exit(1);
}

// Step 2: remove the old AccountsTab router line (with old props)
const oldAccountsLine = "\n              {tab==='accounts' &&<AccountsTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}";
if (src.includes(oldAccountsLine)) {
  src = src.replace(oldAccountsLine, '');
  console.log('[OK] Removed old AccountsTab router line');
} else {
  console.log('[WARN] old accounts router line not found (may already be removed)');
}

fs.writeFileSync(SRC, src, 'utf8');
console.log('\n[DONE] Router updated. TransactionsTab and BalanceLogTab routes added.');
