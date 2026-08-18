/**
 * MCP 内置 HTTP fallback 页面服务器。
 * 用途：让用户能在浏览器里打开与 Cursor 扩展完全一致的 UI（同一份 webview 产物）。
 * 提供：
 *   GET /            -> serve 静态 UI（webview 构建产物）
 *   GET /api/analyze?project=<path> -> 返回 AnalysisResult JSON
 *   GET /api/health  -> 存活检查
 */
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyze } from '@shaohui_jin/comp-core';
import type { AnalyzeOptions } from '@shaohui_jin/comp-core';

/** 解析 webview 产物目录：优先环境变量，其次包内资源，再次 monorepo 内建路径 */
export function resolveUiDir(): string | null {
  const fromEnv = process.env.COMP_INSIGHT_UI_DIR?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  // 包内资源（构建时从 webview 拷贝）
  const bundled = path.resolve(import.meta.dirname, '..', 'ui');
  if (fs.existsSync(path.join(bundled, 'index.html'))) return bundled;

  // monorepo 内建路径（开发期）
  const dev = path.resolve(process.cwd(), 'packages', 'extension', 'webview', 'dist');
  if (fs.existsSync(path.join(dev, 'index.html'))) return dev;

  return null;
}

/** 启动 HTTP 服务器。host 默认 127.0.0.1，port 默认 8931。 */
export function startHttpServer(opts: { host?: string; port?: number } = {}): http.Server {
  const host = opts.host ?? process.env.COMP_INSIGHT_MCP_HOST ?? '127.0.0.1';
  const port = opts.port ?? Number(process.env.COMP_INSIGHT_MCP_PORT ?? 8931);
  const uiDir = resolveUiDir();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ui: uiDir ? 'present' : 'missing' }));
      return;
    }

    if (url.pathname === '/api/analyze') {
      const project = url.searchParams.get('project')?.trim();
      if (!project) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少 project 参数（项目绝对路径）' }));
        return;
      }
      if (!fs.existsSync(project)) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `路径不存在: ${project}` }));
        return;
      }
      const srcDir = url.searchParams.get('src')?.trim() || 'src';
      const entry = (url.searchParams.get('entry')?.trim() || 'src/main.ts,src/main.js').split(',').filter(Boolean);
      const opts: AnalyzeOptions = { srcDir, entryFiles: entry };
      try {
        const result = analyze(project, opts);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    // 没有 UI 产物时给一个说明页
    if (!uiDir) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        `<h1>comp-insight UI</h1><p>未找到 webview 产物。</p>
         <p>设置环境变量 <code>COMP_INSIGHT_UI_DIR</code> 指向 webview 构建目录，或先构建 webview。</p>`,
      );
      return;
    }

    // 静态资源
    let filePath = decodeURIComponent(url.pathname);
    if (filePath === '/') filePath = '/index.html';
    const full = path.normalize(path.join(uiDir, filePath));
    // 防目录穿越
    if (!full.startsWith(path.resolve(uiDir))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    const mime: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, { 'content-type': mime[ext] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });

  server.listen(port, host);
  return server;
}
