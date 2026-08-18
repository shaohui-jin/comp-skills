<template>
  <div class="dd-wrap">
    <div class="dd-head">
      <button @click="$emit('back')">← 返回目录脑图</button>
      <span class="dd-title mono">{{ centerPath }}</span>
      <span class="dd-hint">左列=它依赖的 · 右列=依赖它的</span>
    </div>
    <div ref="el" class="dd-canvas"></div>
    <div class="error" v-if="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { Graph } from '@antv/g6';
import type { AnalysisResult } from '@shaohui_jin/comp-core/tree';

const props = defineProps<{ data: AnalysisResult | null; center: string | null }>();
const emit = defineEmits<{ (e: 'back'): void }>();

const el = ref<HTMLDivElement | null>(null);
const error = ref('');
let graph: Graph | null = null;

const centerPath = ref(props.center || '');

function rebuild() {
  if (!el.value) return;
  if (graph) { try { graph.destroy(); } catch {} graph = null; }
  if (!props.data || !props.center) return;

  const center = props.center;
  centerPath.value = center;

  const upstream = props.data.edges
    .filter((e) => e.to === center)
    .map((e) => e.from)
    .filter((x) => x.endsWith('.vue'));
  const downstream = props.data.edges
    .filter((e) => e.from === center)
    .map((e) => e.to)
    .filter((x) => x.endsWith('.vue'));
  const upSet = new Set(upstream);
  const downSet = new Set(downstream);

  const infoOf = (p: string) => props.data!.nodeStats.find((s) => s.path === p);

  // 手算坐标：上游(左列) / 中间(选中) / 下游(右列)，preset 布局读取样式坐标
  const nodes: any[] = [];
  const edges: any[] = [];
  const COL_W = 300;

  upstream.forEach((p, i) => {
    nodes.push(makeNode(p, 150, 120 + i * 90, infoOf(p)));
    edges.push({ source: p, target: center, style: { stroke: '#9aa4b0' } });
  });
  nodes.push(makeNode(center, COL_W + 150, 120 + Math.max(0, upstream.length - 1) * 45, infoOf(center), true));
  downstream.forEach((p, i) => {
    nodes.push(makeNode(p, COL_W * 2 + 150, 120 + i * 90, infoOf(p)));
    edges.push({ source: center, target: p, style: { stroke: '#5aa5ff' } });
  });

  try {
    graph = new Graph({
      container: el.value,
      data: { nodes, edges },
      layout: { type: 'preset' },
      node: {
        style: (d: any) => {
          const type = d.data?.type || d.style?.isCenter ? 'comp' : 'comp';
          const isCenter = !!d.data?.isCenter;
          const info = d.data?.info || {};
          const inCycle = info.inCycle;
          let fill = isCenter ? '#ffb020' : inCycle ? '#ff6b6b' : '#5aa5ff';
          let stroke = isCenter ? '#c98a00' : inCycle ? '#d0342c' : '#2b6cce';
          const lines = isCenter
            ? `${d.data.name} ★\n入${info.fanIn} 出${info.fanOut} ${info.lineCount}行`
            : `${d.data.name}\n入${info.fanIn ?? 0} 出${info.fanOut ?? 0}`;
          return {
            shape: 'rect',
            size: [180, 52],
            fill,
            stroke,
            lineWidth: isCenter ? 2 : 1,
            radius: 6,
            labelText: lines,
            labelFill: '#111827',
            labelFontSize: 11,
            labelLineHeight: 1.5,
          };
        },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      autoFit: 'view',
    });
    graph.render();
  } catch (e) {
    error.value = '下钻渲染失败: ' + (e instanceof Error ? e.message : String(e));
  }
}

function makeNode(path: string, x: number, y: number, info?: any, isCenter = false): any {
  const name = path.split('/').pop()!.replace(/\.vue$/i, '');
  return {
    id: path,
    data: { type: 'comp', name, path, isCenter, info: info || {} },
    style: { x, y },
  };
}

onMounted(() => rebuild());
watch(() => props.center, () => rebuild());
watch(() => props.data, () => rebuild());
onBeforeUnmount(() => { try { graph?.destroy(); } catch {} });
</script>

<style scoped>
.dd-wrap { display: flex; flex-direction: column; }
.dd-head { display: flex; gap: 10px; align-items: center; padding: 4px 0 8px; flex-wrap: wrap; }
.dd-title { font-weight: 600; color: var(--accent); }
.dd-hint { color: var(--muted); font-size: 12px; margin-left: auto; }
.dd-canvas { width: 100%; height: 520px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; }
</style>
