// Fails when Vietnamese text is hard-coded outside src/i18n (it must go through t()).
// Comments are ignored; proper nouns that never translate are allowed below.
// Usage: node scripts/check-i18n.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src');
const SKIP_DIRS = new Set([path.join(ROOT, 'i18n')]);
const ALLOW = ['Lê Hồng Sơn', 'Tây Nguyên', 'Buôn Ma Thuột'];
const VI = /[ạảãàáâầấậẩẫăằắặẳẵđèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹĐÀÁẢÃẠÂĂÈÉÊÌÍÒÓÔƠÙÚƯỲÝ]/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(p)) yield* files(p);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      yield p;
    }
  }
}

/** Blank out comments but keep line numbers. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (m, pre) => pre);
}

let problems = 0;
for (const file of files(ROOT)) {
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    let text = line;
    for (const ok of ALLOW) text = text.split(ok).join('');
    if (VI.test(text)) {
      problems++;
      console.log(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (problems) {
  console.log(`\n${problems} hard-coded Vietnamese string(s). Move them to src/i18n/vi.ts + en.ts and use t().`);
  process.exit(1);
}
console.log('i18n check: no hard-coded Vietnamese outside src/i18n.');
