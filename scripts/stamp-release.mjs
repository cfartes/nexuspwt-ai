import { readFile, writeFile } from 'node:fs/promises';
const release = process.env.APP_RELEASE || 'development';
if (!/^[a-zA-Z0-9-]{1,80}$/.test(release)) throw new Error('APP_RELEASE inválida.');
const path = new URL('../public/sw.js', import.meta.url);
const source = await readFile(path, 'utf8');
await writeFile(
  path,
  source.replace("const CACHE = 'nexus-shell-v1';", `const CACHE = 'nexus-shell-${release}';`),
);
