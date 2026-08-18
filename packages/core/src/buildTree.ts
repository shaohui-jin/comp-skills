/**
 * 目录脑图聚合：把组件逻辑路径按目录层级聚合成树。
 * 根目录可配置（不写死），默认 `src`。
 * 只在根目录下（含子目录）的组件才会纳入。
 *
 * 注意：此模块不依赖 node:fs / node:path，可在浏览器安全引用，
 * 通过 `@shaohui_jin/comp-core/tree` 子路径导出，供前端 webview 使用。
 */
import type { AnalysisResult, TreeNode, TreeNodeMeta, TreeResult } from './types.js';

// re-export 类型，供前端从 ./tree 子路径一并获取，避免触发 analyzer 的 Node 依赖
export type { AnalysisResult, TreeNode, TreeNodeMeta, TreeResult };

export interface BuildTreeOptions {
  /** 根目录逻辑前缀，如 'src' 或 'src/components'。默认 'src' */
  root?: string;
  /** 文件行数映射：组件逻辑路径 -> 行数（可选，未提供则 0） */
  lineCount?: Map<string, number>;
}

/** 把路径切分成目录段。如 'src/components/base/A.vue' -> ['src','components','base'] */
function dirSegments(logicalPath: string): string[] {
  return logicalPath.split('/').filter((s) => s);
}

/**
 * 构建目录树。
 * @param result 分析结果（提供 components、nodeStats、cycles、deadComponents）
 * @param opts 根目录与行数
 */
export function buildTree(result: AnalysisResult, opts: BuildTreeOptions = {}): TreeResult {
  const rootPath = (opts.root || 'src').replace(/^\/|\/$/g, '');
  const rootSegs = dirSegments(rootPath);

  // 准备每个组件路径 -> meta（nodeStats 已含 lineCount）
  const metaById = new Map<string, TreeNode['info']>();
  for (const st of result.nodeStats) {
    if (!st.path.endsWith('.vue')) continue;
    const inCycle = result.cycles.some((c) => c.components.includes(st.path));
    metaById.set(st.path, {
      fanIn: st.fanIn,
      fanOut: st.fanOut,
      lineCount: st.lineCount,
      inCycle,
      dead: st.dead,
      used: st.used,
    });
  }

  // 找出落在根目录（含子目录）下的组件，且是文件
  const rootDirPrefix = rootPath + '/';
  const rootComponents = result.components
    .filter((p) => p.endsWith('.vue'))
    .filter((p) => p === rootPath || p.startsWith(rootDirPrefix));

  if (rootComponents.length === 0) {
    // 没有落在根下的组件：返回一个空根
    return {
      root: {
        id: rootPath,
        name: basename(rootPath),
        path: rootPath,
        type: 'dir',
        info: { subCount: 0, compCount: 0 },
        children: [],
      },
      nodeCount: 1,
    };
  }

  const root: TreeNode = mkDir(rootPath);
  for (const comp of rootComponents) {
    const segs = dirSegments(comp);
    // 需要把组件相对根多出的目录段建出来
    let node = root;
    let curPath = rootPath;
    for (let i = rootSegs.length; i < segs.length - 1; i++) {
      curPath = curPath + '/' + segs[i];
      node = ensureDir(node, curPath);
    }
    // 最后一段是文件名
    const fileName = segs[segs.length - 1];
    const leaf: TreeNode = {
      id: comp,
      name: fileName.replace(/\.vue$/i, ''),
      path: comp,
      type: 'comp',
      info: metaById.get(comp) ?? {},
      children: [],
    };
    node.children.push(leaf);
  }

  // 递归修正目录节点的 subCount / compCount
  const nodeCount = recount(root, new Set<string>());

  return { root, nodeCount };
}

function mkDir(path: string): TreeNode {
  return {
    id: path,
    name: basename(path),
    path,
    type: 'dir',
    info: { subCount: 0, compCount: 0 },
    children: [],
  };
}

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] || p;
}

function ensureDir(parent: TreeNode, path: string): TreeNode {
  const existing = parent.children.find((c) => c.type === 'dir' && c.path === path);
  if (existing) return existing;
  const node = mkDir(path);
  parent.children.push(node);
  return node;
}

/** 递归递归统计 subCount / compCount；nodeCount 用 seen 集合避免重复 */
function recount(node: TreeNode, seen: Set<string>): number {
  if (seen.has(node.id)) return 0;
  seen.add(node.id);
  if (node.type === 'comp') return 1;
  let subCount = 0;
  let compCount = 0;
  let count = 1; // 本目录节点
  for (const child of node.children) {
    const c = recount(child, seen);
    count += c;
    if (child.type === 'comp') {
      subCount += 1;
      compCount += 1;
    } else {
      subCount += 1;
      compCount += child.info.compCount ?? 0;
    }
  }
  node.info.subCount = subCount;
  node.info.compCount = compCount;
  return count;
}
