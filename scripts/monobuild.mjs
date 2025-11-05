// scripts/monobuild.mjs  (ESM, .mjs)
import { execSync } from 'node:child_process';
import { rmSync, mkdirSync, cpSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const sh = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });

const ROOT = process.cwd();
const OUT  = path.join(ROOT, 'build');

const copyItem = (rel) => {
  const src = path.join(ROOT, rel);
  if (!existsSync(src)) return;
  const dst = path.join(OUT, rel);
  mkdirSync(path.dirname(dst), { recursive: true });
  const isDir = statSync(src).isDirectory();
  cpSync(src, dst, { recursive: isDir, force: true });
};

// 1) чистый артефакт
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 2) корневая статика/HTML
[
  'assets', 'images', 'content', 'o2log', 'forum', 'forumen', 'admin',
  'index.html', 'home.html', 'kids.html'
].forEach(copyItem);

// 3) Канонар → /build/canonar
const CANONAR = path.join(ROOT, 'kainrax', 'canonar');
if (existsSync(CANONAR)) {
  const hasLock = existsSync(path.join(CANONAR, 'package-lock.json'));
  sh(hasLock ? 'npm ci --ignore-scripts --no-audit --no-fund'
             : 'npm install --no-audit --no-fund', CANONAR);
  sh('npm run build', CANONAR);
  cpSync(path.join(CANONAR, 'dist'), path.join(OUT, 'canonar'), { recursive: true, force: true });
}

console.log('✓ build/ ready');
