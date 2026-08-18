#!/usr/bin/env node
/**
 * comp-core CLI
 * 用法:
 *   comp-vue-insight <project-root> [--src src] [--entry a.js,b.js] [--out report.md] [--json]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyze } from './index.js';
import { renderText, renderMermaid } from './report.js';

function parseArgs(list: string[]) {
  const opts: {
    project?: string;
    src?: string;
    entry?: string;
    out?: string;
    json?: boolean;
  } = {};
  const positional: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === '--src') opts.src = list[++i];
    else if (a === '--entry') opts.entry = list[++i] ? String(list[i]) : '';
    else if (a === '--out') opts.out = list[++i];
    else if (a === '--json') opts.json = true;
    else positional.push(a);
  }
  opts.project = positional[0];
  return opts;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.project) {
    console.log('用法: comp-vue-insight <project-root> [--src src] [--entry a.js,b.js] [--out report.md] [--json]');
    process.exit(1);
  }
  const projectRoot = path.resolve(process.cwd(), opts.project);
  if (!fs.existsSync(projectRoot)) {
    console.error(`项目目录不存在: ${projectRoot}`);
    process.exit(1);
  }

  const defaults: string[] = opts.entry ? opts.entry.split(',') : ['src/main.ts', 'src/main.js', 'src/main.tsx', 'src/main.jsx'];
  const result = analyze(projectRoot, {
    srcDir: opts.src || 'src',
    entryFiles: defaults,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const report = renderText(result);
  const mermaid = renderMermaid(result);
  process.stdout.write('\n' + report + '\n\n===== Mermaid 依赖图 =====\n\n' + mermaid + '\n');

  if (opts.out) {
    const outPath = path.resolve(process.cwd(), opts.out);
    fs.writeFileSync(outPath, report + '\n\n===== Mermaid 依赖图 =====\n\n' + mermaid + '\n', 'utf-8');
    process.stdout.write(`\n报告已保存到: ${outPath}\n`);
  }
}

main();
