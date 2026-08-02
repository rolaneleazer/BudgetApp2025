const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

const GRAPH_WITH_MONTHLY_EXPENSES = `
// ─── FINANCIAL KNOWLEDGE GRAPH (ENGRAPHIS INSPIRED) ───────────────────────────
function FinancialGraphTab({ budgetData = {}, accounts = [], debts = [], majorExpenses = [], credits = [], sm }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
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
  const [draggingNode, setDraggingNode] = useState(null);

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
      const id = \`acc-\${acc.id}\`;
      const old = existing.get(id);
      const angle = (i / Math.max(accounts.length, 1)) * Math.PI * 2;
      list.push({
        id, label: \`🏦 \${acc.name}\`, sub: acc.type, type: 'account',
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
      const id = \`cat-\${cat}\`;
      const old = existing.get(id);
      const angle = (i / categories.length) * Math.PI * 2 + 0.5;
      list.push({
        id, label: \`💸 \${cat} Category\`, sub: 'Category Hub', type: 'expense',
        val: 20000, color: catColors[cat] || C.orange,
        x: old ? old.x : cx + Math.cos(angle) * 220,
        y: old ? old.y : cy + Math.sin(angle) * 220,
        vx: 0, vy: 0
      });
    });

    // 4. Itemized Monthly Expenses for Selected Month
    monthlyExpenses.forEach((exp, i) => {
      const id = \`mexp-\${exp.id || i}\`;
      const old = existing.get(id);
      const parentCat = exp.category || 'Variable';
      const catAngleIdx = categories.indexOf(parentCat);
      const baseAngle = (catAngleIdx >= 0 ? catAngleIdx : 1) * (Math.PI / 2);
      const angle = baseAngle + (i * 0.4);

      list.push({
        id,
        label: \`📌 \${exp.description || 'Expense'}\`,
        sub: \`₱\${(exp.amount || 0).toLocaleString()} (\${exp.period || 'Monthly'})\`,
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
      const id = \`debt-\${d.id}\`;
      const old = existing.get(id);
      const angle = (i / Math.max(debts.length, 1)) * Math.PI * 2 + 1.2;
      list.push({
        id, label: \`💳 \${d.name}\`, sub: \`Bal: ₱\${(d.balance || 0).toLocaleString()}\`, type: 'debt',
        val: Math.max(d.balance || 0, 8000), color: C.red,
        x: old ? old.x : cx + Math.cos(angle) * 180,
        y: old ? old.y : cy + Math.sin(angle) * 180,
        vx: 0, vy: 0, amount: d.balance || 0
      });
    });

    // 6. Goals / Major Expenses
    majorExpenses.forEach((m, i) => {
      const id = \`goal-\${m.id}\`;
      const old = existing.get(id);
      const angle = (i / Math.max(majorExpenses.length, 1)) * Math.PI * 2 + 2.1;
      list.push({
        id, label: \`🎯 \${m.name}\`, sub: \`Target: ₱\${(m.budget || 0).toLocaleString()}\`, type: 'goal',
        val: Math.max(m.budget || 0, 10000), color: C.amber,
        x: old ? old.x : cx + Math.cos(angle) * 240,
        y: old ? old.y : cy + Math.sin(angle) * 240,
        vx: 0, vy: 0, amount: m.actual || 0
      });
    });

    nodesRef.current = list;
    alphaRef.current = 1.0;
  }, [accounts, debts, majorExpenses, monthlyExpenses, graphYear, graphMonth]);

  // Edges connecting graph hubs and monthly expense items
  const links = useMemo(() => {
    const edges = [];
    const nodes = nodesRef.current;
    nodes.forEach(n => {
      if (n.type === 'account' || n.type === 'debt' || n.type === 'expense') {
        edges.push({ source: 'core-user', target: n.id });
      }
      if (n.type === 'monthly_item') {
        // Connect itemized monthly expense to its category hub
        const parentCatId = \`cat-\${n.category}\`;
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

  // Re-warm physics when controls change
  useEffect(() => {
    alphaRef.current = 0.4;
  }, [filterType, repelForce, nodeSizeScale, graphYear, graphMonth]);

  // Canvas Physics Loop with Alpha Cooling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const width = canvas.width = canvas.parentElement.clientWidth || 800;
    const height = canvas.height = 650;
    const centerX = width / 2;
    const centerY = height / 2;

    let particles = Array.from({ length: 30 }, () => ({
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

        // 3. Link Spring Attraction
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
        ctx.fillStyle = isSelected ? \`\${n.color}55\` : isHovered ? \`\${n.color}44\` : \`\${n.color}22\`;
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
          ctx.font = \`\${n.type === 'core' ? '700 12px' : '600 11px'} Inter, sans-serif\`;
          const textWidth = ctx.measureText(n.label).width;
          const labelY = n.y + baseRadius + 14;

          ctx.fillStyle = 'rgba(7, 17, 31, 0.85)';
          ctx.fillRect(n.x - textWidth / 2 - 6, labelY - 11, textWidth + 12, 16);
          ctx.strokeStyle = \`\${C.border}66\`;
          ctx.lineWidth = 1;
          ctx.strokeRect(n.x - textWidth / 2 - 6, labelY - 11, textWidth + 12, 16);

          ctx.fillStyle = isSelected ? '#ffffff' : C.text;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, labelY);
        }

        ctx.globalAlpha = 1;
      });

      animId = requestAnimationFrame(step);
    }

    step();
    return () => cancelAnimationFrame(animId);
  }, [links, selectedNode, hoveredNode, filterType, nodeSizeScale, repelForce, labelDensity, searchTerm]);

  // Mouse Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const target = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 28;
    });

    if (target) {
      target.isDragging = true;
      setDraggingNode(target);
      setSelectedNode(target);
      alphaRef.current = 0.3;
    } else {
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggingNode) {
      draggingNode.x = mx;
      draggingNode.y = my;
      draggingNode.vx = 0;
      draggingNode.vy = 0;
      alphaRef.current = 0.3;
    } else {
      const hover = nodesRef.current.find(n => {
        const dx = n.x - mx, dy = n.y - my;
        return Math.sqrt(dx * dx + dy * dy) < 28;
      });
      setHoveredNode(hover || null);
      canvas.style.cursor = hover ? 'pointer' : 'default';
    }
  };

  const handleMouseUp = () => {
    if (draggingNode) {
      draggingNode.isDragging = false;
      setDraggingNode(null);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, padding: '4px 10px', borderRadius: 8, border: \`1px solid \${C.border}\` }}>
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
                    style={{ padding: '6px 10px', borderRadius: 6, border: \`1px solid \${filterType === val ? color : C.border}\`, background: filterType === val ? \`\${color}22\` : 'transparent', color: filterType === val ? color : C.muted, cursor: 'pointer', fontSize: 11, fontWeight: filterType === val ? 700 : 400, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{label}</span>
                    {filterType === val && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            <div style={{ background: C.card2, padding: '10px 12px', borderRadius: 8, border: \`1px solid \${C.border}\` }}>
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
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ display: 'block', width: '100%', height: 650 }}
          />
          <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 10, color: C.muted, background: 'rgba(7,17,31,0.85)', padding: '4px 10px', borderRadius: 6, border: \`1px solid \${C.border}\` }}>
            💡 Select month at top right • Drag expense nodes to custom position
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: \`\${selectedNode.color}22\`, border: \`1px solid \${selectedNode.color}44\` }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: selectedNode.color }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{selectedNode.label}</div>
                  <div style={{ fontSize: 10, color: selectedNode.color, fontWeight: 700, textTransform: 'uppercase' }}>{selectedNode.type.replace('_', ' ')} Node</div>
                </div>
              </div>

              {selectedNode.amount !== undefined && (
                <div style={{ background: C.card2, borderRadius: 8, padding: '10px 12px', border: \`1px solid \${C.border}\` }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Monthly Amount</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.red }}>{peso(selectedNode.amount)}</div>
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

const startMarker = '// ─── FINANCIAL KNOWLEDGE GRAPH (ENGRAPHIS INSPIRED) ───────────────────────────';
const endMarker = '// ─── FINANCIAL CALENDAR';

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  src = src.slice(0, startIdx) + GRAPH_WITH_MONTHLY_EXPENSES + '\n\n' + src.slice(endIdx);
  console.log('[OK] Updated FinancialGraphTab with Monthly Expenses and Month Picker');
} else {
  console.error('[ERROR] Markers not found');
}

fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done!');
