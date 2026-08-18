/**
 * 构建 MCP 包并嵌入 webview UI 产物。
 * 步骤：
 *   1. 用 tsc 编译 src -> dist
 *   2. 把 webview 的 dist 拷贝到 ui/（作为 npm 包内嵌资源，供 HTTP server serve）
 * 先决条件：已构建 @comp-insight/webview 与 @shaohui_jin/comp-core。
 */
import { execSync } from 'node:child_process';
import { mkdir, readdir, copyFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// 1. tsc 编译
execSync('tsc -p tsconfig.json', { cwd: root, stdio: 'inherit' });

// 2. 拷贝 webview dist -> ui/
const webviewDist = resolve(root, '../extension/webview/dist');
const uiDir = resolve(root, 'ui');
await mkdir(uiDir, { recursive: true });
if (await exists(join(webviewDist, 'index.html'))) {
  await copyDir(webviewDist, uiDir);
} else {
  console.warn('未找到 webview 产物，ui/ 为空');
}

console.log('mcp build done: dist/ + ui/');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}
