import { execSync } from 'node:child_process';
import { rmSync, mkdirSync, cpSync, existsSync, statSync, unlinkSync } from 'node:fs';
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

// clean build/
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// root static/html — дополни по факту наличия
[
  'assets', 'images', 'content', 'o2log', 'forum', 'forumen', 'kids',
  'index.html', 'home.html', 'kids.html'
].forEach(copyItem);

// build canonar -> /build/canonar
const CANONAR = path.join(ROOT, 'kainrax', 'canonar');
if (existsSync(CANONAR)) {
  const hasLock = existsSync(path.join(CANONAR, 'package-lock.json'));
  sh(hasLock ? 'npm ci --ignore-scripts --no-audit --no-fund'
             : 'npm install --no-audit --no-fund', CANONAR);
  sh('npm run build', CANONAR);
  cpSync(path.join(CANONAR, 'dist'), path.join(OUT, 'canonar'), { recursive: true, force: true });
}

// убрать catch-all _redirects, если случайно попал
const kill = (p) => { try { unlinkSync(p); } catch (_) {} };
kill(path.join(OUT, '_redirects'));
kill(path.join(OUT, 'canonar', '_redirects'));

console.log('✓ build/ ready');
