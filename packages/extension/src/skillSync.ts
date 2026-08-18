import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import type * as vscode from 'vscode';

const SKILL_NAME = 'comp-vue-insight';
const PLACEHOLDER = '__COMP_INSIGHT_CLI__';

/**
 * 把扩展内置 Skill 同步到各 Agent 的全局技能目录，使 command comp-vue-insight 在任意项目可用。
 * 同时写入 CLI 绝对路径（扩展 dist/cli.js），并标记 .comp-insight-managed 便于识别来源。
 * 目标目录：
 *   ~/.cursor/skills/{name}
 *   ~/.agents/skills/{name}
 *   ~/.meituan-catpaw/{mis}/skills/{name}  (Paw / CatPaw，按用户目录下的 mis 目录枚举)
 */
export async function syncBundledSkill(
  context: vscode.ExtensionContext,
): Promise<{ ok: boolean; targets: string[]; error?: string }> {
  const targets: string[] = [];
  try {
    const src = join(context.extensionPath, 'skills', SKILL_NAME, 'SKILL.md');
    const cliPath = join(context.extensionPath, 'dist', 'cli.js');
    let body = await readFile(src, 'utf8');
    const cliLiteral = JSON.stringify(cliPath).slice(1, -1);
    body = body.split(PLACEHOLDER).join(cliLiteral);

    const home = homedir();

    // 显式目录
    const dirs = [
      join(home, '.cursor', 'skills', SKILL_NAME),
      join(home, '.agents', 'skills', SKILL_NAME),
    ];

    // Paw/CatPaw user skills 目录：~/.meituan-catpaw/<mis>/skills
    const pawRoot = join(home, '.meituan-catpaw');
    try {
      const entries = await readdir(pawRoot, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          dirs.push(join(pawRoot, e.name, 'skills', SKILL_NAME));
        }
      }
    } catch {
      // 没有 Paw 目录则忽略
    }

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'SKILL.md'), body, 'utf8');
      await writeFile(
        join(dir, '.comp-insight-managed'),
        `${context.extension.id}\n${context.extension.packageJSON.version ?? ''}\n${cliPath}\n`,
        'utf8',
      );
      targets.push(dir);
    }

    return { ok: true, targets };
  } catch (err) {
    return {
      ok: false,
      targets,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
