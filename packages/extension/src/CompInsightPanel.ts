import * as vscode from 'vscode';
import { analyze } from '@shaohui_jin/comp-core';
import * as path from 'node:path';

interface AnalyzeRequest {
  type: 'analyze';
  project: string;
  srcDir?: string;
  entry?: string;
}

export class CompInsightPanel {
  public static current: CompInsightPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (raw) => void this.onMessage(raw),
      null,
      this.disposables,
    );
  }

  public static createOrShow(context: vscode.ExtensionContext): void {
    const extensionUri = context.extensionUri;
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (CompInsightPanel.current) {
      CompInsightPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'compInsight',
      'Comp Insight',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ],
      },
    );
    CompInsightPanel.current = new CompInsightPanel(panel, extensionUri);
  }

  private async onMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const req = raw as AnalyzeRequest;
    if (req.type !== 'analyze') return;

    try {
      if (!req.project) {
        await this.post({ type: 'analyzeError', error: '缺少项目路径' });
        return;
      }
      const project = path.resolve(req.project);
      const result = analyze(project, {
        srcDir: req.srcDir ?? 'src',
        entryFiles: (req.entry ?? 'src/main.ts,src/main.js').split(',').filter(Boolean),
      });
      await this.post({ type: 'analyzeResult', data: result });
    } catch (err) {
      await this.post({
        type: 'analyzeError',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async post(msg: unknown): Promise<void> {
    await this.panel.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.css'),
    );
    const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Comp Insight</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 24; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
    return text;
  }

  public dispose(): void {
    CompInsightPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
