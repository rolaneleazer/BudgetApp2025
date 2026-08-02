const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'src', 'App.jsx');

console.log('Extracting DebtsTab from commit fdb2b24...');
const fullOldFile = execSync('git show fdb2b24:src/App.jsx', { encoding: 'utf8' });
const oldLines = fullOldFile.split('\n');

// Extract from line 2194 (0-indexed 2193) to line 2907 (0-indexed 2906)
const debtsTabCode = oldLines.slice(2193, 2907).join('\n');
console.log(`Extracted ${debtsTabCode.split('\n').length} lines.`);

let currentSrc = fs.readFileSync(SRC_PATH, 'utf8');

const marker = 'function CalendarTab';
if (currentSrc.includes(marker)) {
  currentSrc = currentSrc.replace(marker, debtsTabCode + '\n\n' + marker);
  console.log('[OK] Inserted DebtsTab before CalendarTab');
} else {
  console.error('[ERROR] CalendarTab marker not found');
}

fs.writeFileSync(SRC_PATH, currentSrc, 'utf8');
console.log('Done!');
