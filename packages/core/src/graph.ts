/**
 * 有向依赖图 + Tarjan 强连通分量（循环检测）+ 可达性分析（无用组件）
 */
import type { Cycle } from './types.js';

export type Adjacency = Map<string, Set<string>>;

/** Tarjan 求所有强连通分量 */
export function findSCC(adj: Adjacency): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adj.get(v) || new Set<string>();
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const node of adj.keys()) {
    if (!indices.has(node)) strongconnect(node);
  }
  return sccs;
}

/** 从 SCC 中筛出真正的循环（长度>1 或有自环） */
export function extractCycles(sccs: string[][], adj: Adjacency): Cycle[] {
  const cycles: Cycle[] = [];
  for (const scc of sccs) {
    const hasSelfLoop = scc.length === 1 && (adj.get(scc[0]) || new Set<string>()).has(scc[0]);
    if (scc.length > 1 || hasSelfLoop) {
      cycles.push({ components: [...scc].sort() });
    }
  }
  return cycles;
}

/** 从入口集合出发的可达节点（用于判断死组件 / 无用组件） */
export function reachableNodes(adj: Adjacency, entries: Iterable<string>): Set<string> {
  const visited = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const n of adj.get(cur) || []) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return visited;
}
