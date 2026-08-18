/**
 * 报告渲染：Markdown 文本 + Mermaid 依赖图
 * 供 CLI 与 skill 输出；webview UI 直接消费 AnalysisResult 自行绘制，不用本模块。
 */
import type { AnalysisResult } from './types.js';

/** 渲染文本报告（CLI / skill 用） */
export function renderText(result: AnalysisResult): string {
  const l: string[] = [];
  l.push('# Vue 组件依赖分析报告');
  l.push('');
  l.push(`**项目根目录**: \`${result.projectRoot}\``);
  l.push('');
  l.push(`**组件文件数**: ${result.fileCount}`);
  l.push(`**循环依赖**: ${result.cycles.length}`);
  l.push(`**无用组件**: ${result.deadComponents.length}`);
  l.push(`**越层引用**: ${result.layerViolations.length}`);
  l.push(`**未解析引用**: ${result.unresolved.length}`);
  l.push('');
  l.push('---');

  // 循环
  l.push('');
  l.push(`## 循环依赖 (${result.cycles.length})`);
  l.push('');
  if (result.cycles.length === 0) l.push('✅ 未检测到循环依赖。');
  else {
    result.cycles.forEach((c, i) => {
      l.push(`### 环 #${i + 1}`);
      l.push('```');
      l.push(c.components.join('\n'));
      l.push('```');
      l.push('');
    });
  }
  l.push('---');

  // 无用组件
  l.push('');
  l.push(`## 无用组件 (${result.deadComponents.length})`);
  l.push('');
  if (result.deadComponents.length === 0) l.push('✅ 无未使用组件。');
  else {
    l.push('> 未被入口或其它组件引用，可能是遗留代码。');
    l.push('```');
    l.push(result.deadComponents.join('\n'));
    l.push('```');
  }
  l.push('---');

  // 越层
  l.push('');
  l.push(`## 越层引用 (${result.layerViolations.length})`);
  l.push('');
  if (result.layerViolations.length === 0) l.push('✅ 未发现越层引用。');
  else {
    for (const v of result.layerViolations) l.push(`- ${v.message}`);
  }
  l.push('---');

  // 未解析
  l.push('');
  l.push(`## 未解析动态引用 (${result.unresolved.length})`);
  l.push('');
  if (result.unresolved.length === 0) l.push('✅ 无不解析引用。');
  else {
    for (const u of result.unresolved) l.push(`- [${u.file}] ${u.syntax} — ${u.detail}`);
  }
  l.push('---');

  // 扇入扇出排序 top
  l.push('');
  l.push('## 组件统计（扇入倒序 Top 20）');
  l.push('');
  l.push('| 组件 | 扇入 | 扇出 | 层 | 状态 |');
  l.push('|------|-----|-----|----|------|');
  const byFanIn = [...result.nodeStats].sort((a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path));
  for (const s of byFanIn.slice(0, 20)) {
    l.push(`| \`${s.path}\` | ${s.fanIn} | ${s.fanOut} | ${s.layerName} | ${s.dead ? '废弃' : s.used ? '在用' : '？'} |`);
  }

  return l.join('\n');
}

/** 渲染 Mermaid 依赖图（markdown 可嵌入） */
export function renderMermaid(result: AnalysisResult): string {
  const nodeIds = new Map<string, { short: string; label: string }>();
  let counter = 0;
  const shortFor = (p: string) => {
    if (nodeIds.has(p)) return nodeIds.get(p)!.short;
    const label = p.split('/').pop()!.replace(/\.vue$/i, '');
    const short = `N${counter++}`;
    nodeIds.set(p, { short, label });
    return short;
  };

  for (const c of result.components) shortFor(c);

  const lines = ['graph TD'];
  for (const c of result.components) {
    const { short, label } = nodeIds.get(c)!;
    lines.push(`  ${short}["${label}"];`);
  }
  for (const e of result.edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      lines.push(`  ${nodeIds.get(e.from)!.short} --> ${nodeIds.get(e.to)!.short};`);
    }
  }
  // 循环高亮
  const deadHigh = result.deadComponents.map((c) => nodeIds.get(c)?.short).filter(Boolean) as string[];
  for (const cyc of result.cycles) {
    const members = cyc.components.map((c) => nodeIds.get(c)?.short).filter(Boolean) as string[];
    if (members.length) lines.push(`  class ${members.join(',')} cycle;`);
  }
  if (deadHigh.length) lines.push(`  class ${deadHigh.join(',')} dead;`);
  if (result.cycles.length) lines.push('  classDef cycle fill:#fbb,stroke:#d00;');
  if (deadHigh.length) lines.push('  classDef dead fill:#ccc,stroke:#666,stroke-dasharray: 3 3;');

  return lines.join('\n');
}
