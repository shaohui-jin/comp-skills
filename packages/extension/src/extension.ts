import * as vscode from 'vscode';

/**
 * Comp Insight 扩展激活入口。
 * 注册「打开分析面板」「同步 skill」命令，并在启动时尝试把 skill 同步到全局。
 */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Comp Insight');
  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.commands.registerCommand('compInsight.openWeb', () => {
      import('./CompInsightPanel.js')
        .then(({ CompInsightPanel }) => CompInsightPanel.createOrShow(context))
        .catch((err) => {
          output.appendLine(`openWeb 失败: ${err}`);
          void vscode.window.showErrorMessage(
            err instanceof Error ? err.message : String(err),
          );
        });
    }),
    vscode.commands.registerCommand('compInsight.syncSkill', () => {
      void import('./skillSync.js')
        .then(({ syncBundledSkill }) => syncBundledSkill(context))
        .then((r) => {
          if (r.ok) {
            void vscode.window.showInformationMessage(
              `Comp Insight Skill 已同步到全局：${r.targets.join('；')}`,
            );
          } else {
            void vscode.window.showErrorMessage(
              `Comp Insight Skill 同步失败：${r.error ?? 'unknown'}`,
            );
          }
        })
        .catch((err) => {
          output.appendLine(`syncSkill 失败: ${err}`);
          void vscode.window.showErrorMessage(
            err instanceof Error ? err.message : String(err),
          );
        });
    }),
  );

  // 启动时并行同步 skill（不阻塞激活）
  void import('./skillSync.js')
    .then(({ syncBundledSkill }) => syncBundledSkill(context))
    .then((r) => {
      if (r.ok) {
        output.appendLine(`Skill 已同步: ${r.targets.join('; ')}`);
      } else {
        output.appendLine(`Skill 同步失败: ${r.error ?? 'unknown'}`);
      }
    })
    .catch((err) => {
      output.appendLine(`Skill 同步异常: ${err}`);
    });
}

export function deactivate(): void {
  // no-op
}
