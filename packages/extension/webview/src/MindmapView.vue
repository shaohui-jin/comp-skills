<template>
  <div class="mm-wrap">
    <div class="mm-toolbar">
      <label>目录根</label>
      <select v-model="root" @change="rebuild">
        <option v-for="r in rootOptions" :key="r" :value="r">{{ r }}</option>
      </select>
      <button @click="toggleAll">全部展开/收起</button>
      <input v-model="filter" placeholder="过滤组件名…" @input="rebuild" class="mm-filter" />
      <span class="mm-legend">
        <span class="dot" style="background:#f5b942"></span>目录
        <span class="dot" style="background:#5aa5ff"></span>在用
        <span class="dot" style="background:#ff6b6b"></span>循环
        <span class="dot" style="background:#cfd3da"></span>无用
      </span>
      <span class="mm-hint">点击组件查看依赖 · 点击目录展开/收起</span>
    </div>
    <div ref="el" class="mm-canvas"></div>
    <div class="empty" v-if="noData">当前根目录下没有组件。</div>
    <div class="error" v-if="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { Graph } from '@antv/g6';
import { buildTree } from '@shaohui_jin/comp-core/tree';
import type { AnalysisResult, TreeNode } from '@shaohui_jin/comp-core/tree';

const props = defineProps<{ data: AnalysisResult | null }>();
const emit = defineEmits<{ (e: 'open-component', path: string): void }>();

const el = ref<HTMLDivElement | null>(null);
const root = ref('src');
const filter = ref('');
const error = ref('');
let graph: Graph | null = null;
let expandedDepth = 3; // 默认展开层数

const rootOptions = computed<string[]>(() => {
  if (!props.data) return ['src'];
  // 收集独特的目录前缀做候选
  const set = new Set<string>(); set.add('src');
  for (const c of props.data.components) {
    if (!c.endsWith('.vue')) continue;
    const segs = c.split('/');
    if (segs.length >= 2) set.add(segs.slice(0, 2).join('/'));
    if (segs.length >= 3) set.add(segs.slice(0, 3).join('/'));
  }
  return [...set].sort();
});

const noData = ref(false);

function rebuild() {
  if (!el.value) return;
  if (graph) { try { graph.destroy(); } catch {} graph = null; }
  if (!props.data) return;

  const kw = filter.value.trim().toLowerCase();
  const tree = buildTree(props.data, { root: root.value });

  // 过滤 + 展开控制：dir 节点默认到 expandedDepth 层展开，其余折叠
  const prune = (node: TreeNode, depth: number): TreeNode | null => {
    if (node.type === 'comp') {
      if (kw && !node.name.toLowerCase().includes(kw)) return null;
      return node;
    }
    if (depth >= expandedDepth && !kw) {
      // 目录折叠：仅保留节点本身，子项收到 meta
      return { ...node, children: [] };
    }
    const children = node.children
      .map((c) => prune(c, depth + 1))
      .filter((c): c is TreeNode => c !== null);
    return { ...node, children };
  };

  const rootNode = prune(tree.root, 0);
  if (!rootNode) { noData.value = true; return; }
  noData.value = false;

  // 手算横向树坐标：x=深度*列距，y=叶子槽位；用 preset 布局渲染
  const { g6Data, nodeList, edges } = toTreeG6(rootNode, 0);

  try {
    graph = new Graph({
      container: el.value,
      data: { nodes: nodeList, edges },
      layout: { type: 'preset' },
      node: { style: (d: any) => nodeStyle(d) },
      edge: { style: { stroke: '#9aa4b0', lineWidth: 1 } },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      autoFit: 'view',
    });
    graph.on('node:click', (ev: any) => {
      const id = ev.target?.id || ev.item?.id;
      if (id == null) return;
      const n = nodeList.find((x: any) => x.id === id);
      if (!n) return;
      if (n.data.type === 'comp') {
        emit('open-component', id);
      } else {
        // 翻转该目录的展开状态
        toggleDir(id);
      }
    });
    graph.render();
  } catch (e) {
    error.value = '脑图渲染失败: ' + (e instanceof Error ? e.message : String(e));
  }
}

let collapsedDirs = new Set<string>();

function toTreeG6(
  node: TreeNode,
  depth: number,
): { g6Data: any; nodeList: any[]; edges: any[] } {
  const nodeList: any[] = [];
  const edges: any[] = [];
  const collapsed = collapsedDirs.has(node.id);

  const walk = (n: TreeNode, d: number): number => {
    // 返回以 n 为根的叶子数（用于分配 y）
    n.info = { ...n.info };
    if (n.type === 'comp') {
      nodeList.push({
        id: n.id,
        data: { type: n.type, name: n.name, path: n.path, info: n.info },
      });
      return 1;
    }
    if (collapsed && n === node) {
      // 当前目录折叠，不再展开子项
      nodeList.push({
        id: n.id,
        data: { type: n.type, name: n.name, path: n.path, info: n.info },
      });
      return 1;
    }
    const kids = n.children || [];
    if (kids.length === 0) {
      nodeList.push({
        id: n.id,
        data: { type: n.type, name: n.name, path: n.path, info: n.info },
      });
      return 1;
    }
    let total = 0;
    for (const k of kids) {
      const sub = walk(k, d + 1);
      edges.push({
        source: n.id,
        target: k.id,
        style: { stroke: '#9aa4b0', lineWidth: 1 },
      });
      total += sub;
    }
    // 目录节点坐标在后续按叶子计数中心分配；这里先记录
    nodeList.push({
      id: n.id,
      data: { type: n.type, name: n.name, path: n.path, info: n.info },
      _leafCount: total,
    });
    return total;
  };

  walk(node, depth);

  // 按 startLeaf 分配 y：预排序（父必须先于子，保证叶子累积）
  const stat = new Map<string, { leaf: number; depth: number }>();
  // 重新做一次后序给每个节点记叶子数和深度，用于坐标
  // 简单方案：根据 edges 建子表，后序遍历算叶子
  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source)!.push(e.target);
  }
  const depthMap = new Map<string, number>();
  const assignDepth = (id: string, d: number) => {
    depthMap.set(id, Math.max(depthMap.get(id) ?? 0, d));
    for (const c of childMap.get(id) || []) assignDepth(c, d + 1);
  };
  assignDepth(node.id, 0);

  const leaf = new Map<string, number>();
  const calcLeaf = (id: string): number => {
    const kids = childMap.get(id) || [];
    if (kids.length === 0) { leaf.set(id, 1); return 1; }
    let t = 0;
    for (const k of kids) t += calcLeaf(k);
    leaf.set(id, t);
    return t;
  };
  calcLeaf(node.id);

  // 分配 y（叶子递增槽位），x = depth * colWidth
  const constH = 78;
  const colW = 210;
  let yAcc = 0;
  const currentY = new Map<string, number>();
  const place = (id: string, x: number) => {
    const d = depthMap.get(id) ?? 0;
    const kids = childMap.get(id) || [];
    if (kids.length === 0) {
      currentY.set(id, yAcc * constH + 60);
      yAcc += 1;
      return;
    }
    let firstY = Infinity, lastY = -Infinity;
    for (const k of kids) {
      place(k, x + colW);
      const ky = currentY.get(k)!;
      if (ky < firstY) firstY = ky;
      if (ky > lastY) lastY = ky;
    }
    currentY.set(id, (firstY + lastY) / 2);
  };
  place(node.id, 40);

  // 写回坐标到 nodeList
  for (const n of nodeList) {
    const d = depthMap.get(n.id) ?? 0;
    n.style = { x: d * colW + 40, y: currentY.get(n.id) ?? 80 };
  }

  return { g6Data: null as any, nodeList, edges };
}

function toggleDir(id: string) {
  if (collapsedDirs.has(id)) collapsedDirs.delete(id); else collapsedDirs.add(id);
  rebuild();
}

function nodeStyle(d: any) {
  const t = d.data?.type || d.type;
  const info = d.data?.info || {};
  const isComp = t === 'comp';
  const isDead = isComp && info.dead;
  const inCycle = isComp && info.inCycle;

  let fill = isComp ? '#5aa5ff' : '#f5b942';
  let stroke = isComp ? '#2b6cce' : '#c9971f';
  if (inCycle) { fill = '#ff6b6b'; stroke = '#d0342c'; }
  if (isDead && !inCycle) { fill = '#cfd3da'; stroke = '#8b9099'; }

  // 多行 label：目录显示名 + 子项数；组件显示名 + 入/出/行
  const lines = isComp
    ? `${d.data.name}\n入${info.fanIn ?? 0} 出${info.fanOut ?? 0}  ${info.lineCount ?? 0}行`
    : `${d.data.name}\n${info.subCount ?? 0} 项`;

  return {
    shape: 'rect',
    size: [132, 48],
    fill,
    stroke,
    lineWidth: isComp ? 1.5 : 1,
    radius: isComp ? 4 : 8,
    labelText: lines,
    labelFill: '#111827',
    labelFontSize: 11,
    labelLineHeight: 1.5,
    labelTextAlign: 'center',
  };
}

function toggleAll() {
  expandedDepth = expandedDepth >= 3 ? 1 : 3;
  rebuild();
}

onMounted(() => {
  rebuild();
});

watch(() => props.data, () => { rebuild(); });

onBeforeUnmount(() => { try { graph?.destroy(); } catch {} });
</script>

<style scoped>
.mm-wrap { display: flex; flex-direction: column; }
.mm-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 0 8px; }
.mm-toolbar select { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; font-size: 12px; }
.mm-toolbar button { padding: 4px 10px; font-size: 12px; }
.mm-filter { width: 180px; }
.mm-hint { color: var(--muted); font-size: 12px; margin-left: auto; }
.mm-legend { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--fg); flex-wrap: wrap; }
.mm-legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 3px; vertical-align: middle; }
.mm-canvas { width: 100%; height: 620px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; }
</style>
