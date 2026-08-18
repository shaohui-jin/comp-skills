#!/usr/bin/env node
/**
 * comp-insight MCP server —— 把 Vue 组件依赖分析开放给任意 MCP 宿主（Cursor / Claude Code / VS Code…）
 *
 * 全部只读：依赖图、循环依赖、无用组件、扇入扇出、分层/越层检查。
 * 附带一个 HTTP UI 页面服务（与 Cursor 扩展共用同一份 webview 产物），
 * 通过 comp_open_ui 工具返回 URL，宿主可用浏览器打开同一套 UI。
 *
 * 用法：
 *   comp-mcp-server                 # 以 MCP stdio 模式运行
 *   comp-mcp-server --http [--port] # 只启动 HTTP UI 服务，不起 stdio
 *   comp-mcp-server serve-ui        # 同上（别名）
 *
 * 环境变量：
 *   COMP_INSIGHT_MCP_HOST / _PORT    HTTP 监听地址（默认 127.0.0.1 / 8931）
 *   COMP_INSIGHT_UI_DIR              指向 webview 构建目录（可选）
 *
 * 注意：stdout 是 stdio 协议流，日志一律走 console.error / http 服务相关往 stderr 打。
 */
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { analyze, renderText } from '@shaohui_jin/comp-core';
import { startHttpServer, resolveUiDir } from './http-server.js';

/** 构建时由脚本注入；tsx 直跑时无此值 */
declare const __MCP_VERSION__: string;
const VERSION = typeof __MCP_VERSION__ === 'string' ? __MCP_VERSION__ : '0.0.0-dev';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false } as const;

function text(body: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: body }] };
}
function failed(err: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return {
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'comp-insight', version: VERSION });

  server.registerTool(
    'comp_analyze',
    {
      title: '组件依赖分析',
      description:
        '分析一个 Vue 项目的组件依赖：构建依赖图、检测循环依赖、找出无用组件（孤儿组件）、' +
        '统计每个组件的扇入扇出、检查分层/越层引用。返回结构化结果与文本摘要。',
      annotations: READ_ONLY,
      inputSchema: z.object({
        project: z.string().describe('项目根目录的绝对路径'),
        srcDir: z.string().optional().describe('源码目录，默认 src'),
        entry: z.string().optional().describe('入口文件，逗号分隔，默认 src/main.ts,src/main.js'),
      }),
    },
    async ({ project, srcDir, entry }) => {
      try {
        const result = analyze(project, {
          srcDir: srcDir || 'src',
          entryFiles: entry ? entry.split(',').filter(Boolean) : ['src/main.ts', 'src/main.js'],
        });
        const summary = renderText(result);
        return text(summary);
      } catch (err) {
        return failed(err);
      }
    },
  );

  server.registerTool(
    'comp_open_ui',
    {
      title: '打开分析 UI 页',
      description:
        '启动（或复用）内置的本地 HTTP 服务，并返回可在浏览器打开的分析面板 URL。' +
        '页面与 Cursor 扩展的面板一致（同一构建产物），可在项目上做可视化分析。',
      annotations: READ_ONLY,
      inputSchema: z.object({
        project: z.string().optional().describe('项目根目录，用于预填分析路径'),
      }),
    },
    async ({ project }) => {
      const base = resolveUiDir();
      const port = Number(process.env.COMP_INSIGHT_MCP_PORT ?? 8931);
      const host = process.env.COMP_INSIGHT_MCP_HOST ?? '127.0.0.1';
      const url = `http://${host}:${port}/?project=${encodeURIComponent(project || '')}`;
      const lines = [
        `UI 面板（与 Cursor 扩展一致）：`,
        url,
        '',
        base ? `webview 产物已就绪。` : `⚠️ 未找到 webview 产物，页面将显示占位说明。设置 COMP_INSIGHT_UI_DIR 指向 webview 构建目录。`,
      ];
      return text(lines.join('\n'));
    },
  );

  return server;
}

function startHttpAndLog(): void {
  const port = Number(process.env.COMP_INSIGHT_MCP_PORT ?? 8931);
  const host = process.env.COMP_INSIGHT_MCP_HOST ?? '127.0.0.1';
  const server = startHttpServer({ host, port });
  server.on('listening', () => {
    console.error(`[comp-insight-http] 分析面板已启动: http://${host}:${port}/`);
  });
  server.on('error', (e) => {
    console.error(`[comp-insight-http] 启动失败: ${(e as Error).message}`);
    process.exit(1);
  });
}

const args = process.argv.slice(2);
if (args.includes('--http') || args.includes('serve-ui')) {
  startHttpAndLog();
} else {
  const handle = serveStdio(createServer);
  console.error(`[comp-insight-mcp] v${VERSION} 已就绪（stdio）`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void handle.close());
  }
}
