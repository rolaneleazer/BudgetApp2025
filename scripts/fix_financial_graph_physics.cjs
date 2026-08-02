const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

const UPDATED_GRAPH_TAB = `
// ─── FINANCIAL KNOWLEDGE GRAPH (ENGRAPHIS INSPIRED) ───────────────────────────
function FinancialGraphTab({ budgetData, accounts = [], debts = [], majorExpenses = [], credits = [], sm }) {
  const canvasRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [nodeSizeScale, setNodeSizeScale] = useState(1);
  const [repelForce, setRepelForce] = useState(80);
  const [labelDensity, setLabelDensity] = useState('all'); // 'all' | 'hubs' | 'hover'
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);

  // Initialize Nodes with clean radial offsets around center
  const nodes = useMemo(() => {
    const list = [];
    const totalNetWorth = accounts.reduce((s, a) => s + (a.balance || 0), 0);

    // Central Core Hub
    list.push({ id: 'core-user', label: '👤 User Financial Hub', type: 'core', val: totalNetWorth || 100000, color: '#7257ff', x: 400, y: 320, vx: 0, vy: 0 });

    // Accounts
    accounts.forEach((acc, i) => {
      const angle = (i / Math.max(accounts.length, 1)) * Math.PI * 2;
      list.push({
        id: \`acc-\${acc.id}\`,
        label: \`🏦 \${acc.name}\`,
        sub: acc.type,
        type: 'account',
        val: Math.max(acc.balance || 0, 5000),
        color: TYPE_CLR[acc.type] || C.blue,
        x: 400 + Math.cos(angle) * 140,
        y: 320 + Math.sin(angle) * 140,
        vx: 0, vy: 0,
        amount: acc.balance || 0
      });
    });

    // Expense Categories
    const categories = ['Fixed', 'Variable', 'Debt', 'Investment'];
    const catColors = { Fixed: C.red, Variable: C.orange, Debt: C.amber, Investment: C.purple };
    categories.forEach((cat, i) => {
      const angle = (i / categories.length) * Math.PI * 2 + 0.5;
      list.push({
        id: \`cat-\${cat}\`,
        label: \`💸 \${cat} Expenses\`,
        sub: 'Category',
        type: 'expense',
        val: 20000,
        color: catColors[cat] || C.orange,
        x: 400 + Math.cos(angle) * 220,
        y: 320 + Math.sin(angle) * 220,
        vx: 0, vy: 0
      });
    });

    // Credit Cards / Debts
    debts.forEach((d, i) => {
      const angle = (i / Math.max(debts.length, 1)) * Math.PI * 2 + 1.2;
      list.push({
        id: \`debt-\${d.id}\`,
        label: \`💳 \${d.name}\`,
        sub: \`Bal: ₱\${(d.balance || 0).toLocaleString()}\`,
        type: 'debt',
        val: Math.max(d.balance || 0, 8000),
        color: C.red,
        x: 400 + Math.cos(angle) * 190,
        y: 320 + Math.sin(angle) * 190,
        vx: 0, vy: 0,
        amount: d.balance || 0
      });
    });

    // Goals / Major Expenses
    majorExpenses.forEach((m, i) => {
      const angle = (i / Math.max(majorExpenses.length, 1)) * Math.PI * 2 + 2.1;
      list.push({
        id: \`goal-\${m.id}\`,
        label: \`🎯 \${m.name}\`,
        sub: \`Target: ₱\${(m.budget || 0).toLocaleString()}\`,
        type: 'goal',
        val: Math.max(m.budget || 0, 10000),
        color: C.amber,
        x: 400 + Math.cos(angle) * 250,
        y: 320 + Math.sin(angle) * 250,
        vx: 0, vy: 0,
        amount: m.actual || 0
      });
    });

    return list;
  }, [accounts, debts, majorExpenses]);

  // Edges connecting graph hubs
  const links = useMemo(() => {
    const edges = [];
    nodes.forEach(n => {
      if (n.type === 'account' || n.type === 'debt' || n.type === 'expense') {
        edges.push({ source: 'core-user', target: n.id });
      }
      if (n.type === 'goal') {
        const sav = nodes.find(a => a.sub === 'Savings' || a.sub === 'Investment');
        edges.push({ source: sav ? sav.id : 'core-user', target: n.id });
      }
    });
    return edges;
  }, [nodes]);

  // Force Physics Loop with Center Gravity & Mouse Dragging
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
      speed: 0.003 + Math.random() * 0.005
    }));

    function step() {
      // 1. Center Gravity Force (keeps graph centered and prevents corner sticking)
      nodes.forEach(n => {
        if (n.isDragging) return;
        const dx = centerX - n.x;
        const dy = centerY - n.y;
        n.vx += dx * 0.002;
        n.vy += dy * 0.002;
      });

      // 2. Node Repulsion Force
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = repelForce * 1.5;
          if (dist < targetDist) {
            const force = (targetDist - dist) / dist * 0.03;
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
          const force = (dist - 130) * 0.003;
          if (!s.isDragging) { s.vx += dx * force; s.vy += dy * force; }
          if (!t.isDragging) { t.vx -= dx * force; t.vy -= dy * force; }
        }
      });

      // 4. Update Position with Velocity Dampening
      nodes.forEach(n => {
        if (n.isDragging) return;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;

        // Soft Inner Bounds (keep inside viewport padding)
        n.x = Math.max(60, Math.min(width - 60, n.x));
        n.y = Math.max(60, Math.min(height - 60, n.y));
      });

      // 5. Render Canvas
      ctx.clearRect(0, 0, width, height);

      // Render Grid Overlay
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

      // Render Flowing Particles
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

        const alpha = isFiltered ? 1 : 0.2;
        const baseRadius = (n.type === 'core' ? 24 : 12 + Math.log10(Math.max(n.val, 100)) * 2.2) * nodeSizeScale;

        ctx.globalAlpha = alpha;

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

        // Draw Labels cleanly below node with background pill for legibility
        const showLabel = labelDensity === 'all' || (labelDensity === 'hubs' && (n.type === 'core' || baseRadius > 18)) || (labelDensity === 'hover' && (isSelected || isHovered));
        if (showLabel && isFiltered) {
          ctx.font = \`\${n.type === 'core' ? '700 12px' : '600 11px'} Inter, sans-serif\`;
          const textWidth = ctx.measureText(n.label).width;
          const labelY = n.y + baseRadius + 14;

          // Label Pill Background
          ctx.fillStyle = 'rgba(7, 17, 31, 0.85)';
          ctx.fillRect(n.x - textWidth / 2 - 6, labelY - 11, textWidth + 12, 16);
          ctx.strokeStyle = \`\${C.border}66\`;
          ctx.lineWidth = 1;
          ctx.strokeRect(n.x - textWidth / 2 - 6, labelY - 11, textWidth + 12, 16);

          // Label Text
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
  }, [nodes, links, selectedNode, hoveredNode, filterType, nodeSizeScale, repelForce, labelDensity, searchTerm]);

  // Mouse Dragging & Click Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const target = nodes.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 28;
    });

    if (target) {
      target.isDragging = true;
      setDraggingNode(target);
      setSelectedNode(target);
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
    } else {
      const hover = nodes.find(n => {
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
              <input type="range" min="30" max="200" step="10" value={repelForce} onChange={e => setRepelForce(Number(e.target.value))} style={{ width: '100%', accentColor: C.teal }} />
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
            💡 Click and drag any node to move • Dimmed nodes represent unselected categories
          </div>
        </Card>

        {/* ── Right Inspection Drawer (Engraphis style) ── */}
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

const startMarker = '// ─── FINANCIAL KNOWLEDGE GRAPH (ENGRAPHIS INSPIRED) ───────────────────────────';
const endMarker = '// ─── FINANCIAL CALENDAR';

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  src = src.slice(0, startIdx) + UPDATED_GRAPH_TAB + '\n\n' + src.slice(endIdx);
  console.log('[OK] Replaced FinancialGraphTab with updated physics and drag engine');
} else {
  console.error('[ERROR] Markers not found');
}

fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done!');
