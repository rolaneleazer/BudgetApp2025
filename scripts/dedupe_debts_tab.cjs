const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');
let src = fs.readFileSync(SRC_PATH, 'utf8');

const marker = '// ─── DEBT MANAGER';
const firstIdx = src.indexOf(marker);
const secondIdx = src.indexOf(marker, firstIdx + marker.length);

if (firstIdx !== -1 && secondIdx !== -1) {
  const nextSection = src.indexOf('// ─── FINANCIAL CALENDAR', secondIdx);
  if (nextSection !== -1) {
    src = src.slice(0, secondIdx) + src.slice(nextSection);
    console.log('[OK] Removed duplicate DebtsTab section');
  }
}

fs.writeFileSync(SRC_PATH, src, 'utf8');
console.log('Done!');
