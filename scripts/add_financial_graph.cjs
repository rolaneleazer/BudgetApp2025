const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

// ── 1. DEFINE FinancialGraphTab COMPONENT ────────────────────────────────────
const GRAPH_TAB_CODE = `
// ─── FINANCIAL KNOWLEDGE GRAPH (ENGRAPHIS INSPIRED) ───────────────────────────
function FinancialGraphTab({ budgetData, accounts, debts = [], majorExpenses = [], credits = [], sm }) {
  const canvasRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [nodeSizeScale, setNodeSizeScale] = useState(1);
  const [repelForce, setRepelForce] = useState(120);
  const [labelDensity, setLabelDensity] = useState('all'); // 'all' | 'hubs' | 'hover'
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);

  // Generate Graph Nodes and Edges from live financial state
  const nodes = useMemo(() => {
    const list = [];

    // Central Core Hub
    const totalNetWorth = accounts.reduce((s, a) => s + a.balance, 0);
    list.push({ id: 'core-user', label: '👤 User Financial Hub', type: 'core', val: totalNetWorth || 100000, color: '#7257ff', x: 400, y: 300, vx: 0, vy: 0 });

    // Account Nodes
    accounts.forEach((acc, i) => {
      list.push({
        id: \`acc-\${acc.id}\`,
        label: \`🏦 \${acc.name}\`,
        sub: acc.type,
        type: 'account',
        val: Math.max(acc.balance, 5000),
        color: TYPE_CLR[acc.type] || C.blue,
        x: 400 + Math.cos(i) * 180,
        y: 300 + Math.sin(i) * 180,
        vx: 0, vy: 0,
        amount: acc.balance
      });
    });

    // Expense Category Nodes
    const categories = ['Fixed', 'Variable', 'Debt', 'Investment'];
    const catColors = { Fixed: C.red, Variable: C.orange, Debt: C.amber, Investment: C.purple };
    categories.forEach((cat, i) => {
      list.push({
        id: \`cat-\${cat}\`,
        label: \`💸 \${cat} Expenses\`,
        sub: 'Category',
        type: 'expense',
        val: 25000,
        color: catColors[cat],
        x: 400 + Math.cos(i + 2) * 280,
        y: 300 + Math.sin(i + 2) * 280,
        vx: 0, vy: 0
      });
    });

    // Debt / Credit Card Nodes
    debts.forEach((d, i) => {
      list.push({
        id: \`debt-\${d.id}\`,
        label: \`💳 \${d.name}\`,
        sub: \`Bal: ₱\${d.balance.toLocaleString()}\`,
        type: 'debt',
        val: Math.max(d.balance, 8000),
        color: C.red,
        x: 400 + Math.cos(i + 4) * 240,
        y: 300 + Math.sin(i + 4) * 240,
        vx: 0, vy: 0,
        amount: d.balance
      });
    });

    // Goals / Major Expenses
    majorExpenses.forEach((m, i) => {
      list.push({
        id: \`goal-\${m.id}\`,
        label: \`🎯 \${m.name}\`,
        sub: \`Target: ₱\${m.budget.toLocaleString()}\`,
        type: 'goal',
        val: Math.max(m.budget, 10000),
        color: C.amber,
        x: 400 + Math.cos(i + 1) * 320,
        y: 300 + Math.sin(i + 1) * 320,
        vx: 0, vy: 0,
        amount: m.actual
      });
    });

    return list;
  }, [accounts, debts, majorExpenses]);

  // Edges connecting graph hubs
  const links = useMemo(() => {
    const edges = [];
    nodes.forEach(n => {
      if (n.type === 'account') {
        edges.push({ source: 'core-user', target: n.id });
      }
      if (n.type === 'debt') {
        edges.push({ source: 'core-user', target: n.id });
      }
      if (n.type === 'expense') {
        edges.push({ source: 'core-user', target: n.id });
      }
      if (n.type === 'goal') {
        // Connect goals to investment/savings accounts
        const sav = nodes.find(a => a.sub === 'Savings' || a.sub === 'Investment');
        edges.push({ source: sav ? sav.id : 'core-user', target: n.id });
      }
    });
    return edges;
  }, [nodes]);

  // Canvas Force Physics Loop & Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const width = canvas.width = canvas.parentElement.clientWidth || 800;
    const height = canvas.height = 650;

    let particles = Array.from({ length: 40 }, () => ({
      linkIndex: Math.floor(Math.random() * links.length),
      progress: Math.random(),
      speed: 0.005 + Math.random() * 0.008
    }));

    function step() {
      // Force Physics simulation simulation loop
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < repelForce * 2) {
            const force = (repelForce * 2 - dist) / dist * 0.02;
            a.vx -= dx * force;
            a.vy -= dy * force;
            b.vx += dx * force;
            b.vy += dy * force;
          }
        }
      }

      // Link attraction forces
      links.forEach(link => {
        const s = nodes.find(n => n.id === link.source);
        const t = nodes.find(n => n.id === link.target);
        if (s && t) {
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 140) * 0.003;
          s.vx += dx * force;
          s.vy += dy * force;
          t.vx -= dx * force;
          t.vy -= dy * force;
        }
      });

      // Update positions with dampening
      nodes.forEach(n => {
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
        // Keep in bounds
        n.x = Math.max(50, Math.min(width - 50, n.x));
        n.y = Math.max(50, Math.min(height - 50, n.y));
      });

      // Render Canvas Background
      ctx.clearRect(0, 0, width, height);

      // Draw Grid overlay
      ctx.strokeStyle = 'rgba(28, 43, 66, 0.25)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Draw Edges
      links.forEach(l => {
        const s = nodes.find(n => n.id === l.source);
        const t = nodes.find(n => n.id === l.target);
        if (s && t) {
          const isHighlighted = selectedNode && (selectedNode.id === s.id || selectedNode.id === t.id);
          ctx.strokeStyle = isHighlighted ? '#30d6b0' : 'rgba(75, 141, 255, 0.25)';
          ctx.lineWidth = isHighlighted ? 2.5 : 1.2;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
        }
      });

      // Draw Flowing Particles along links (Engraphis style)
      particles.forEach(p => {
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

      // Draw Nodes
      nodes.forEach(n => {
        if (filterType !== 'all' && n.type !== filterType && n.type !== 'core') return;

        const isSelected = selectedNode?.id === n.id;
        const isHovered = hoveredNode?.id === n.id;
        const isMatchingSearch = searchTerm && n.label.toLowerCase().includes(searchTerm.toLowerCase());
        const baseRadius = (n.type === 'core' ? 24 : 12 + Math.log10(Math.max(n.val, 100)) * 2.5) * nodeSizeScale;

        // Glowing node outer ring
        ctx.fillStyle = isSelected ? \`\${n.color}55\` : isHovered ? \`\${n.color}44\` : \`\${n.color}22\`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseRadius + 6, 0, Math.PI * 2);
        ctx.fill();

        // Solid Node Circle
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected || isMatchingSearch) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Draw Node Text Labels
        const showLabel = labelDensity === 'all' || (labelDensity === 'hubs' && (n.type === 'core' || baseRadius > 18)) || (labelDensity === 'hover' && (isSelected || isHovered));
        if (showLabel) {
          ctx.fillStyle = isSelected ? '#ffffff' : C.text;
          ctx.font = \`\${n.type === 'core' ? '700 12px' : '500 11px'} Inter, sans-serif\`;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + baseRadius + 14);
          if (n.sub) {
            ctx.fillStyle = C.muted;
            ctx.font = '400 9px Inter, sans-serif';
            ctx.fillText(n.sub, n.x, n.y + baseRadius + 25);
          }
        }
      });

      animId = requestAnimationFrame(step);
    }

    step();
    return () => cancelAnimationFrame(animId);
  }, [nodes, links, selectedNode, hoveredNode, filterType, nodeSizeScale, repelForce, labelDensity, searchTerm]);

  // Click & Hover interaction handler
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const clicked = nodes.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 26;
    });

    setSelectedNode(clicked || null);
  };

  const handleCanvasMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hover = nodes.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 26;
    });

    setHoveredNode(hover || null);
    canvas.style.cursor = hover ? 'pointer' : 'default';
  };

  return (
    <div>
      {/* ── Top Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>🕸 Financial Knowledge Graph</div>
          <div style={{ fontSize: 12, color: C.muted }}>Interactive force-directed graph of your financial accounts, categories, credit cards, and goals.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Inp type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="🔍 Find node in graph…" style={{ width: 180, padding: '6px 10px', fontSize: 12 }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sm ? '1fr' : '260px 1fr 280px', gap: 14 }}>
        {/* ── Left Controls Sidebar (Engraphis style) ── */}
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>🎛 Graph Controls</SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Filter Node Types</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  ['all', '🔀 All Entities', C.blue],
                  ['account', '🏦 Accounts', C.green],
                  ['expense', '💸 Outflow Categories', C.orange],
                  ['debt', '💳 Credit Cards', C.red],
                  ['goal', '🎯 Savings Goals', C.amber],
                ].map(([val, label, color]) => (
                  <button key={val} onClick={() => setFilterType(val)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: \`1px solid \${filterType === val ? color : C.border}\`, background: filterType === val ? \`\${color}22\` : 'transparent', color: filterType === val ? color : C.muted, cursor: 'pointer', fontSize: 11, fontWeight: filterType === val ? 700 : 400, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    {filterType === val && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Node Size Scale ({nodeSizeScale.toFixed(1)}x)</label>
              <input type="range" min="0.5" max="2.5" step="0.1" value={nodeSizeScale} onChange={e => setNodeSizeScale(Number(e.target.value))} style={{ width: '100%', accentColor: C.purple }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Cluster Repel Force ({repelForce})</label>
              <input type="range" min="40" max="250" step="10" value={repelForce} onChange={e => setRepelForce(Number(e.target.value))} style={{ width: '100%', accentColor: C.teal }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>Label Display Density</label>
              <select value={labelDensity} onChange={e => setLabelDensity(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: C.bg, color: C.text, fontSize: 12, outline: 'none', width: '100%' }}>
                <option value="all">Show All Labels</option>
                <option value="hubs">Major Hubs Only</option>
                <option value="hover">Hover / Select Only</option>
              </select>
            </div>
          </div>
        </Card>

        {/* ── Center Canvas Graph ── */}
        <Card style={{ marginBottom: 0, padding: 0, overflow: 'hidden', position: 'relative', background: '#040b17', border: \`1px solid \${C.border}\`, borderRadius: 10 }}>
          <canvas ref={canvasRef} onClick={handleCanvasClick} onMouseMove={handleCanvasMouseMove} style={{ display: 'block', width: '100%', height: 650 }} />
          <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 10, color: C.muted, background: 'rgba(7,17,31,0.85)', padding: '4px 10px', borderRadius: 6, border: \`1px solid \${C.border}\` }}>
            💡 Drag nodes to rearrange • Click node to inspect details
          </div>
        </Card>

        {/* ── Right Inspection Drawer (Engraphis style) ── */}
        <Card style={{ marginBottom: 0 }}>
          <SecTitle>🔍 Node Inspector</SecTitle>
          {!selectedNode ? (
            <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '40px 0', lineHeight: 1.6 }}>
              👈 Click any node on the graph to inspect its connected accounts, volume, and details.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: \`\${selectedNode.color}22\`, border: \`1px solid \${selectedNode.color}44\` }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: selectedNode.color }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{selectedNode.label}</div>
                  <div style={{ fontSize: 10, color: selectedNode.color, fontWeight: 700, textTransform: 'uppercase' }}>{selectedNode.type} Node</div>
                </div>
              </div>

              {selectedNode.amount !== undefined && (
                <div style={{ background: C.card2, borderRadius: 8, padding: '10px 12px', border: \`1px solid \${C.border}\` }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Current Value</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{peso(selectedNode.amount)}</div>
                </div>
              )}

              <div>
                <SecTitle style={{ fontSize: 10 }}>Connected Network Edges</SecTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).map((l, idx) => {
                    const otherId = l.source === selectedNode.id ? l.target : l.source;
                    const otherNode = nodes.find(n => n.id === otherId);
                    if (!otherNode) return null;
                    return (
                      <div key={idx} style={{ padding: '6px 10px', borderRadius: 6, background: \`\${C.panel}88\`, border: \`1px solid \${C.border}44\`, fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{otherNode.label}</span>
                        <span style={{ fontSize: 10, color: C.muted }}>→ link</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={() => setSelectedNode(null)}
                style={{ marginTop: 10, padding: '7px', borderRadius: 6, border: \`1px solid \${C.border}\`, background: 'none', color: C.muted, cursor: 'pointer', fontSize: 11 }}>
                Close Inspection Drawer
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

`;

// ── 2. INSERT FinancialGraphTab COMPONENT ─────────────────────────────────────
if (!src.includes('function FinancialGraphTab')) {
  const marker = '// ─── FINANCIAL CALENDAR';
  if (src.includes(marker)) {
    src = src.replace(marker, GRAPH_TAB_CODE + '\n\n' + marker);
    console.log('[OK] Inserted FinancialGraphTab before CalendarTab');
  } else {
    console.error('[ERROR] CalendarTab marker not found');
  }
}

// ── 3. UPDATE TABS, TLBL, NAV_TABS ───────────────────────────────────────────
if (!src.includes("id:'graph'")) {
  // Update TABS
  const oldTABS = "    {id:'reports',     label:sm?'📊':'📊 Reports'},";
  const newTABS = "    {id:'graph',       label:sm?'🕸':'🕸 Graph'},\n    {id:'reports',     label:sm?'📊':'📊 Reports'},";
  if (src.includes(oldTABS)) {
    src = src.replace(oldTABS, newTABS);
    console.log('[OK] Updated TABS with graph');
  }

  // Update TLBL
  const oldTLBL = "    reports:'Financial Reports',";
  const newTLBL = "    graph:'Financial Knowledge Graph',\n    reports:'Financial Reports',";
  if (src.includes(oldTLBL)) {
    src = src.replace(oldTLBL, newTLBL);
    console.log('[OK] Updated TLBL with graph');
  }

  // Update NAV_TABS
  const oldNAV = "    {id:'reports',     label:'Reports',            icon:'📊',group:'analytics'},";
  const newNAV = "    {id:'graph',       label:'Financial Graph',    icon:'🕸',group:'analytics'},\n    {id:'reports',     label:'Reports',            icon:'📊',group:'analytics'},";
  if (src.includes(oldNAV)) {
    src = src.replace(oldNAV, newNAV);
    console.log('[OK] Updated NAV_TABS with graph');
  }
}

// ── 4. UPDATE ROUTER ─────────────────────────────────────────────────────────
if (!src.includes("tab==='graph'")) {
  const oldRoute = "{tab==='reports'   &&<ReportTab budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm} session={session} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}";
  const newRoute = "{tab==='graph'     &&<FinancialGraphTab budgetData={budgetData} accounts={accounts} debts={debts} majorExpenses={majorExpenses} credits={credits} sm={sm}/>}\n              {tab==='reports'   &&<ReportTab budgetData={budgetData} accounts={accounts} majorExpenses={majorExpenses} credits={credits} debts={debts} balanceHistory={balanceHistory} sm={sm} session={session} readOnly={readOnly} canWrite={canWrite} canUpdate={canUpdate}/>}";
  if (src.includes(oldRoute)) {
    src = src.replace(oldRoute, newRoute);
    console.log('[OK] Updated tab router with graph route');
  } else {
    console.error('[ERROR] Could not find report route pattern in router');
  }
}

fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('✅ FinancialGraphTab successfully added to src/App.jsx!');
