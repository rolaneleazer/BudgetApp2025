const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'App.jsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Fix the duplicate block between line 5061 and 5278
const badStart = "padding: '4px 8px',\nreturn (\n    <div style={{background:`radial-gradient";
const badEnd   = "<AdminTab sm={sm} users={users} setUsers={setUsers} adminConfigured={adminConfigured} fetchUsers={fetchUsers}/>}\n      </div>\n    </div>\n  );\n}\n\n// ─── ADMIN PANEL";

const idx1 = content.indexOf("return (\n    <div style={{background:`radial-gradient");
const idx2 = content.indexOf("// ─── ADMIN PANEL");

if (idx1 !== -1 && idx2 !== -1 && idx1 < idx2) {
  // Re-stitch the clean version of the button
  const fixedButton = `padding: '4px 8px',
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
              {tab==='dashboard'&&<Dashboard budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm}/>}
              {tab==='accounts'    &&<AccountsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='transactions'&&<TransactionsTab accounts={accounts} setAccounts={setAccounts} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='balancelog'  &&<BalanceLogTab accounts={accounts} setAccounts={setAccounts} balanceHistory={balanceHistory} setBalanceHistory={setBalanceHistory} sm={sm} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='history'  &&<HistoryTab budgetData={budgetData} sm={sm}/>}
              {tab==='budget'   &&<BudgetTab budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='investments'&&<InvestmentsTab accounts={accounts} setAccounts={setAccounts} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='debts'     &&<DebtsTab debts={debts} setDebts={setDebts} budgetData={budgetData} setBudgetData={setBudgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='credits'  &&<CreditsTab credits={credits} setCredits={setCredits} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='expenses' &&<MajorTab majorExpenses={majorExpenses} setMajorExpenses={setMajorExpenses} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='calendar'  &&<CalendarTab budgetData={budgetData} sm={sm} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
              {tab==='reports'   &&<ReportTab budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm} session={session} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}
            </>
          );
        })()}
        {tab==='admin'     &&<AdminTab sm={sm} users={users} setUsers={setUsers} adminConfigured={adminConfigured} fetchUsers={fetchUsers}/>}
      </div>
    </div>
  );
}

// ─── ADMIN PANEL`;

  const beforeBad = content.slice(0, content.indexOf("padding: '4px 8px',\nreturn ("));
  const afterBad  = content.slice(idx2);
  content = beforeBad + fixedButton + "\n" + afterBad;
  console.log('[OK] Cleaned up duplicate block in App.jsx');
}

// 2. Add Edit User state inside AdminTab if missing
const stateMarker = "const [resetPwd, setResetPwd] = useState(\"\");";
if (content.includes(stateMarker) && !content.includes("const [showEditModal, setShowEditModal]")) {
  const newState = `const [resetPwd, setResetPwd] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editPassword, setEditPassword] = useState("");`;
  content = content.replace(stateMarker, newState);
  console.log('[OK] Added Edit User state');
}

// 3. Add handleEditUser function inside AdminTab if missing
const deleteMarker = "async function handleDelete(user) {";
if (content.includes(deleteMarker) && !content.includes("async function handleEditUser")) {
  const editFunc = `async function handleEditUser(e) {
    e.preventDefault();
    if (!targetUser) return;
    setActionLoading(true);
    setActionSuccess("");
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(\`/api/admin/users?id=\${targetUser.id}\`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": \`Bearer \${session.access_token}\`
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
      
      setActionSuccess(\`Successfully updated user \${editEmail || targetUser.email}\`);
      setShowEditModal(false);
      setTargetUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(user) {`;
  content = content.replace(deleteMarker, editFunc);
  console.log('[OK] Added handleEditUser function');
}

// 4. Add Edit button to table row
const resetBtnMarker = `<Btn 
                            onClick={() => {
                              setActionSuccess(""); 
                              setError("");
                              setTargetUser(user);
                              setShowPwdModal(true);
                            }}
                            style={{ padding: "4px 8px", fontSize: 11, border: \`1px solid \${C.blue}44\`, color: C.blue }}
                            disabled={actionLoading}
                          >
                            Reset Pwd
                          </Btn>`;

const editAndResetBtns = `<Btn 
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
                            style={{ padding: "4px 8px", fontSize: 11, border: \`1px solid \${C.purple}44\`, color: C.purple }}
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
                            style={{ padding: "4px 8px", fontSize: 11, border: \`1px solid \${C.blue}44\`, color: C.blue }}
                            disabled={actionLoading}
                          >
                            Reset Pwd
                          </Btn>`;

if (content.includes(resetBtnMarker)) {
  content = content.replace(resetBtnMarker, editAndResetBtns);
  console.log('[OK] Added Edit button to user table');
}

// 5. Add Edit User Modal
const pwdModalEndMarker = `{/* System Diagnostics & Tests Card */}`;
const editModalJsx = `{/* Edit User Modal */}
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
                    border: \`1px solid \${C.border}\`,
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

      {/* System Diagnostics & Tests Card */}`;

if (content.includes(pwdModalEndMarker) && !content.includes("Edit User Modal")) {
  content = content.replace(pwdModalEndMarker, editModalJsx);
  console.log('[OK] Inserted Edit User Modal UI');
}

fs.writeFileSync(file, content, 'utf8');
console.log('✅ App.jsx updated successfully!');
