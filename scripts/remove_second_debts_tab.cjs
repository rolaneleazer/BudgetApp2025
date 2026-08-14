const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

const marker = '// ─── DEBT MANAGER ─────────────────────────────────────────────────────────────';
const firstPos = src.indexOf(marker);
const secondPos = src.indexOf(marker, firstPos + marker.length);

if (firstPos !== -1 && secondPos !== -1) {
  const nextSection = src.indexOf('function CalendarTab', secondPos);
  if (nextSection !== -1) {
    src = src.slice(0, secondPos) + src.slice(nextSection);
    console.log('[OK] Removed second DebtsTab block cleanly');
  }
}

fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done!');
