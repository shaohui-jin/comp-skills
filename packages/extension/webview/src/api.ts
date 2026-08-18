/**
 * 统一数据层：同一份 webview 产物在两种环境里自动切换数据源。
 *  - VS Code / Cursor 扩展 webview：使用 postMessage 与宿主通信
 *  - 浏览器（MCP HTTP fallback 页）：使用 fetch 调 /api/analyze
 */
import type { AnalysisResult, AnalyzeOptions } from '@shaohui_jin/comp-core';

/** 是否运行在 VS Code webview 内（宿主注入 acquireVsCodeApi） */
export function isWebview(): boolean {
  return typeof (window as unknown as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function';
}

/** webview 宿主消息（由 extension 注入） */
interface Host {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/** webview 加载完成的 promise，确保 acquireVsCodeApi 就绪 */
let hostPromise: Promise<Host> | null = null;
function getHost(): Promise<Host> {
  if (!hostPromise) {
    hostPromise = new Promise((resolve) => {
      const w = window as unknown as { acquireVsCodeApi?: () => Host };
      // 有的宿主同步可用，有的要等；这里直接用 acquireVsCodeApi
      if (w.acquireVsCodeApi) {
        resolve(w.acquireVsCodeApi());
      } else {
        // 非 webview 环境不该到这里
        throw new Error('未检测到 VS Code host');
      }
    });
  }
  return hostPromise;
}

/** 浏览器环境的 API base（MCP HTTP 服务同源） */
const BROWSER_BASE = '';

export interface AnalyzeCallOptions {
  project: string;
  srcDir?: string;
  entry?: string;
  onMessage?: (ev: MessageEvent) => void;
}

/**
 * 发起一次分析，返回 AnalysisResult。
 * webview 下走 postMessage，浏览器下走 fetch。
 */
export async function analyze(options: AnalyzeCallOptions): Promise<AnalysisResult> {
  if (isWebview()) {
    const host = await getHost();
    const result = await new Promise<AnalysisResult>((resolve, reject) => {
      const handler = (ev: MessageEvent) => {
        const msg = ev.data as { type?: string; data?: unknown; error?: string };
        if (msg && msg.type === 'analyzeResult') {
          window.removeEventListener('message', handler);
          if (msg.data) resolve(msg.data as AnalysisResult);
          else reject(new Error(msg.error || '分析失败'));
        } else if (msg && msg.type === 'analyzeError') {
          window.removeEventListener('message', handler);
          reject(new Error(msg.error || '分析失败'));
        }
      };
      window.addEventListener('message', handler);
      host.postMessage({
        type: 'analyze',
        project: options.project,
        srcDir: options.srcDir ?? 'src',
        entry: options.entry ?? 'src/main.ts,src/main.js',
      });
    });
    return result;
  }

  // 浏览器：fetch /api/analyze
  const qs = new URLSearchParams();
  qs.set('project', options.project);
  qs.set('src', options.srcDir ?? 'src');
  qs.set('entry', options.entry ?? 'src/main.ts,src/main.js');
  const resp = await fetch(`${BROWSER_BASE}/api/analyze?${qs.toString()}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error((err as { error?: string }).error || '分析请求失败');
  }
  return (await resp.json()) as AnalysisResult;
}

export type { AnalysisResult, AnalyzeOptions };
