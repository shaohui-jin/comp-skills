<template>
  <div class="ov-wrap">
    <div class="ov-toolbar">
      <span class="ov-legend">
        <span class="dot" style="background:#5aa5ff"></span>正常
        <span class="dot" style="background:#ff6b6b"></span>循环
        <span class="dot" style="background:#cfd3da"></span>无用
      </span>
      <button @click="downloadPng">导出 PNG</button>
      <span class="ov-hint">节点大小 ∝ 扇出数 · 可滚轮缩放</span>
    </div>
    <div ref="el" class="ov-canvas"></div>
    <div class="error" v-if="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { Graph } from '@antv/g6';
import type { AnalysisResult } from '@shaohui_jin/comp-core/tree';

const props = defineProps<{ data: AnalysisResult | null }>();
const el = ref<HTMLDivElement | null>(null);
const error = ref('');
let graph: Graph | null = null;

function rebuild() {
  if (!el.value) return;
  if (graph) { try { graph.destroy(); } catch {} graph = null; }
  if (!props.data) return;

  const result = props.data;
  const nodes = result.components.map((p) => {
    const st = result.nodeStats.find((s) => s.path === p);
    const inCycle = result.cycles.some((c) => c.components.includes(p));
    const dead = !!st?.dead;
    const fanOut = st?.fanOut ?? 0;
    let fill = '#5aa5ff', stroke = '#2b6cce';
    if (inCycle) { fill = '#ff6b6b'; stroke = '#d0342c'; }
    else if (dead) { fill = '#cfd3da'; stroke = '#8b9099'; }
    return {
      id: p,
      data: {
        name: p.split('/').pop()!.replace(/\.vue$/i, ''),
        path: p,
        info: st || {},
      },
      style: {
        shape: 'rect',
        size: [Math.max(60, 40 + fanOut * 18), 36],
        fill,
        stroke,
        lineWidth: 1,
        radius: 4,
        labelText: p.split('/').pop()!.replace(/\.vue$/i, ''),
        labelFill: '#111827',
        labelFontSize: 10,
      },
    };
  });
  const edges = result.edges
    .filter((e) => e.from.endsWith('.vue') && e.to.endsWith('.vue'))
    .map((e) => ({ source: e.from, target: e.to, style: { stroke: '#9aa4b0', lineWidth: 1 } }));

  try {
    graph = new Graph({
      container: el.value,
      data: { nodes, edges },
      layout: { type: 'dagre', rankdir: 'LR', nodesep: 16, ranksep: 70 },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      autoFit: 'view',
    });
    graph.render();
  } catch (e) {
    error.value = '全量图渲染失败: ' + (e instanceof Error ? e.message : String(e));
  }
}

function downloadPng() {
  if (!graph) return;
  try {
    graph.toDataURL({ mode: 'download', type: 'png', name: 'comp-insight' });
  } catch (e) {
    error.value = '导出失败: ' + (e instanceof Error ? e.message : String(e));
  }
}

onMounted(() => rebuild());
watch(() => props.data, () => rebuild());
onBeforeUnmount(() => { try { graph?.destroy(); } catch {} });
</script>

<style scoped>
.ov-wrap { display: flex; flex-direction: column; }
.ov-toolbar { display: flex; gap: 12px; align-items: center; padding: 4px 0 8px; flex-wrap: wrap; }
.ov-legend { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--fg); flex-wrap: wrap; }
.ov-legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 3px; vertical-align: middle; }
.ov-hint { color: var(--muted); font-size: 12px; margin-left: auto; }
.ov-canvas { width: 100%; height: 620px; background: var(--card); border: 1px solid var(--border); border-radius: 8px; }
</style>
