/**
 * 主分析器：扫描项目、收集组件、构建依赖图、计算统计、检测循环/无用/越层。
 * 这是 core 的唯一计算入口，UI / MCP / CLI 三者共用。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSFC, toPascalCase } from './parser.js';
import { findSCC, extractCycles, reachableNodes, type Adjacency } from './graph.js';
import { DEFAULT_LAYERS, layerOf, checkLayerViolations } from './layers.js';
import type {
  AnalysisResult,
  AnalyzeOptions,
  DependencyEdge,
  ComponentNode,
  UnresolvedRef,
} from './types.js';

/** 递归收集目录下所有 .vue 文件（忽略 node_modules/.git） */
export function collectVueFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      out.push(...collectVueFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

/** 解析 import 的 .vue 相对/别名路径为绝对路径 */
function resolveImportVue(
  spec: string,
  importerAbs: string,
  projectRoot: string,
  absToLogical: Map<string, string>,
): string | null {
  try {
    let target: string;
    if (spec.startsWith('@/')) {
      target = path.join(path.resolve(projectRoot, 'src'), spec.replace(/^@\//, ''));
    } else if (spec.startsWith('.')) {
      target = path.resolve(path.dirname(path.resolve(importerAbs)), spec);
    } else {
      return null; // 包名，跳过
    }
    if (!path.extname(target)) target += '.vue';
    const resolved = path.resolve(target);
    return absToLogical.has(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/** 从入口 .js/.ts 文件中提取直接 import 的 .vue 路径 */
function findEntryImports(entryFiles: string[], projectRoot: string, absToLogical: Map<string, string>): string[] {
  const entries = new Set<string>();
  const extRe = /\.(js|ts|mjs|jsx|tsx)$/;
  for (const file of entryFiles) {
    if (!fs.existsSync(file) || !extRe.test(file)) continue;
    let code = '';
    try {
      code = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const importRe = /from\s+['"]([^'"]+\.vue)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(code))) {
      const r = resolveImportVue(m[1], file, projectRoot, absToLogical);
      if (r) entries.add(r);
    }
    const dynRe = /import\(\s*['"]([^'"]+\.vue)['"]\s*\)/g;
    while ((m = dynRe.exec(code))) {
      const r = resolveImportVue(m[1], file, projectRoot, absToLogical);
      if (r) entries.add(r);
    }
  }
  return [...entries];
}

/**
 * 扫描 src/router 目录（路由配置），把其中的 .vue 引用（懒加载页面）也作为入口组件。
 * 常见形态：
 *   component: () => import('@/views/func.vue')
 *   const A = () => import('@/views/foo.vue')
 *   import.meta.glob('...') 匹配的若为 .vue 也纳入
 * 这些页面本身是路由入口，虽不被 main 直接 import，但应视为「在用」起点。
 */
function findRouterEntryVue(
  projectRoot: string,
  srcDir: string,
  absToLogical: Map<string, string>,
): string[] {
  const routerDir = path.join(projectRoot, srcDir, 'router');
  if (!fs.existsSync(routerDir)) return [];
  const entries = new Set<string>();

  const files = collectAllFiles(routerDir);
  const vueRe = /['"]((?:@\/|[^'"]*)\/?[^'"]*?\.vue)['"]/g;
  for (const file of files) {
    if (!/\.(js|ts|mjs|jsx|tsx)$/.test(file)) continue;
    let code = '';
    try { code = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    let m: RegExpExecArray | null;
    vueRe.lastIndex = 0;
    while ((m = vueRe.exec(code))) {
      const spec = m[1];
      if (spec.includes('*')) continue; // glob 模式，跳过
      const r = resolveImportVue(spec, file, projectRoot, absToLogical);
      if (r) entries.add(r);
    }
  }
  return [...entries];
}

/** 递归收集目录下所有文件（用于 router 扫描） */
function collectAllFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectAllFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** 主分析函数 */
export function analyze(projectRoot: string, opts: AnalyzeOptions = {}): AnalysisResult {
  const { srcDir = 'src', entryFiles = [], ignore = [], layers = DEFAULT_LAYERS } = opts;
  const srcPath = path.resolve(projectRoot, srcDir);

  const allVue = collectVueFiles(srcPath).filter(
    (f) => !ignore.some((ig) => f.includes(ig)),
  );

  // 绝对路径 -> 逻辑路径
  const absToLogical = new Map<string, string>();
  const logicalToAbs = new Map<string, string>();
  for (const f of allVue) {
    const abs = path.resolve(f);
    let logical = (path.relative(projectRoot, abs) || abs).replace(/\\/g, '/');
    absToLogical.set(abs, logical);
    logicalToAbs.set(logical, abs);
  }

  // 第一遍解析：收集每个文件的 imports（.vue）与 template 候选
  const parsedFiles = new Map<string, ReturnType<typeof parseSFC>>();
  const fileImports = new Map<string, Map<string, string[]>>(); // abs -> PascalName -> target abs[]
  const lineCounts = new Map<string, number>(); // logical -> 行数
  const edgeList: DependencyEdge[] = [];
  const unresolved: UnresolvedRef[] = [];

  for (const abs of allVue) {
    const selfLogical = absToLogical.get(path.resolve(abs))!;
    const source = fs.readFileSync(path.resolve(abs), 'utf-8');
    lineCounts.set(selfLogical, source.split('\n').length);
    const r = parseSFC(source);
    parsedFiles.set(path.resolve(abs), r);

    const importMap = new Map<string, string[]>();
    for (const [localName, specs] of r.imports) {
      const pascal = toPascalCase(localName);
      for (const spec of specs) {
        if (!spec.source.includes('.vue')) continue;
        const targetAbs = resolveImportVue(spec.source, path.resolve(abs), projectRoot, absToLogical);
        if (targetAbs) {
          const targetLogical = absToLogical.get(targetAbs)!;
          if (!importMap.has(pascal)) importMap.set(pascal, []);
          if (!importMap.get(pascal)!.includes(targetLogical)) {
            importMap.get(pascal)!.push(targetLogical);
          }
          // import 型边（无论是否被模板使用，组件 import 即依赖；未用到的会进孤儿判定）
          edgeList.push({ from: selfLogical, to: targetLogical, kind: 'import' });
        } else {
          unresolved.push({
            file: selfLogical,
            syntax: `import ${localName} from '${spec.source}'`,
            detail: `无法解析路径 ${spec.source}`,
          });
        }
      }
    }
    fileImports.set(path.resolve(abs), importMap);
  }

  // 第二遍：模板标签匹配 import -> template 边
  for (const abs of allVue) {
    const selfLogical = absToLogical.get(path.resolve(abs))!;
    const r = parsedFiles.get(path.resolve(abs))!;
    const importMap = fileImports.get(path.resolve(abs))!;

    for (const cand of r.templateTags) {
      const pascal = toPascalCase(cand);
      const targets = importMap.get(pascal) || importMap.get(cand) || [];
      for (const targetLogical of targets) {
        // 避免与 import 边重复：只加 template 语义标注，去重由 graph 层处理
        if (!edgeList.some((e) => e.from === selfLogical && e.to === targetLogical && e.kind === 'template')) {
          edgeList.push({ from: selfLogical, to: targetLogical, kind: 'template' });
        }
      }
    }
  }

  // 构建邻接表（去重）
  const adjacency: Adjacency = new Map();
  const allNodes = new Set<string>();
  for (const logical of absToLogical.values()) {
    adjacency.set(logical, new Set<string>());
    allNodes.add(logical);
  }
  // 去重边
  const seenEdges = new Set<string>();
  for (const e of edgeList) {
    const key = `${e.from}->${e.to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    if (!adjacency.has(e.from)) adjacency.set(e.from, new Set());
    adjacency.get(e.from)!.add(e.to);
  }
  const uniqueEdges: DependencyEdge[] = [...seenEdges].map((k) => {
    const [from, to] = k.split('->');
    const orig = edgeList.find((e) => e.from === from && e.to === to);
    return { from, to, kind: (orig && orig.kind) || 'template' };
  });

  // —— 循环检测 ——
  const sccs = findSCC(adjacency);
  const cycles = extractCycles(sccs, adjacency);

  // —— 入口 / 无用组件 ——
  const entryFromFiles = findEntryImports(
    entryFiles.map((e) => path.resolve(projectRoot, e)),
    projectRoot,
    absToLogical,
  );
  // 路由懒加载页面也作为入口（页面虽不被 main 直接 import，但由 router 使用）
  const routerEntries = findRouterEntryVue(projectRoot, srcDir, absToLogical);
  const entryAbs = new Set([...entryFromFiles, ...routerEntries]);
  const entryLogical = new Set([...entryAbs].map((a) => absToLogical.get(a)).filter(Boolean) as string[]);

  // 从入口出发的可达集合
  const reachable = reachableNodes(adjacency, entryLogical);

  // 所有有入边的节点
  const hasInEdge = new Set<string>();
  for (const [, tos] of adjacency) {
    for (const to of tos) hasInEdge.add(to);
  }

  const deadComponents = [...allNodes].filter(
    (n) => !entryLogical.has(n) && !reachable.has(n),
  );
  // 孤立候选（无入边且非入口）
  const orphans = [...allNodes].filter(
    (n) => !entryLogical.has(n) && !hasInEdge.has(n),
  );

  // —— 扇入 / 扇出 ——
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const node of allNodes) {
    fanIn.set(node, 0);
    fanOut.set(node, adjacency.get(node)?.size ?? 0);
  }
  for (const [, tos] of adjacency) {
    for (const to of tos) fanIn.set(to, (fanIn.get(to) || 0) + 1);
  }

  const nodeStats: ComponentNode[] = [...allNodes]
    .map((n) => {
      const layer = layerOf(n, layers);
      return {
        path: n,
        name: n.split('/').pop()!.replace(/\.vue$/i, ''),
        fanIn: fanIn.get(n) || 0,
        fanOut: fanOut.get(n) || 0,
        used: reachable.has(n) || entryLogical.has(n),
        dead: !entryLogical.has(n) && !reachable.has(n),
        layer: layer.level,
        layerName: layer.name,
        lineCount: lineCounts.get(n) || 0,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  // —— 越层检查（仅统计 .vue 组件间依赖）——
  const compEdges = uniqueEdges.filter((e) => e.to.endsWith('.vue'));
  const layerViolations = checkLayerViolations(compEdges, layers);

  return {
    projectRoot,
    fileCount: allVue.length,
    components: [...allNodes].sort(),
    edges: uniqueEdges.sort((a, b) => a.from.localeCompare(b.from)),
    cycles,
    deadComponents: deadComponents.sort(),
    orphans: orphans.sort(),
    entries: [...entryLogical].sort(),
    nodeStats,
    layerViolations,
    unresolved,
    diagnostics: [],
  };
}
