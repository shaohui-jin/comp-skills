<template>
  <div class="gv-wrap">
    <div ref="el" class="gv-canvas"></div>
    <div class="empty" v-if="empty">暂无依赖数据。</div>
    <div class="error" v-if="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { Graph } from '@antv/g6';
import type { AnalysisResult, ComponentNode } from '@shaohui_jin/comp-core/tree';

const props = defineProps<{ data: AnalysisResult | null }>();
const emit = defineEmits<{ (e: 'select', path: string | null): void }>();

const el = ref<HTMLDivElement | null>(null);
const error = ref('');
const empty = ref(false);
let graph: Graph | null = null;

function rebuild() {
  if (!el.value) return;
  if (graph) { try { graph.destroy(); } catch {} graph = null; }
  if (!props.data || !props.data.components.length) {
    empty.value = true;
    return;
  }
  empty.value = false;

  const result = props.data;

  const nodes = result.components
    .filter((p) => p.endsWith('.vue'))
    .map((p) => {
      const st = result.nodeStats.find((s) => s.path === p);
      const inCycle = result.cycles.some((c) => c.components.includes(p));
      const dead = !!st?.dead;
      const fanOut = st?.fanOut ?? 0;
      const fanIn = st?.fanIn ?? 0;
      const lines = st?.lineCount ?? 0;
      const name = p.split('/').pop()!.replace(/\.vue$/i, '');

      // 卡片颜色
      let fill = '#3b82f6';
      let stroke = '#1e40af';
      let labelFill = '#ffffff';
      if (inCycle) { fill = '#ef4444'; stroke = '#b91c1c'; }
      else if (dead) { fill = '#d1d5db'; stroke = '#6b7280'; labelFill = '#1f2937'; }

      // 卡片大小：宽 168，高 56（三行文字至少 50px）
      const h = 56;

      // 多行 label
      const status = inCycle ? '🔴 循环' : dead ? '⚫ 未使用' : '✅ 在用';
      const label = `${name}\n入${fanIn} 出${fanOut}  ${lines}行\n${status}`;

      return {
        id: p,
        type: 'rect',
        data: { name, path: p, fanIn, fanOut, lines, inCycle, dead, status },
        style: {
          size: [160, h],
          fill,
          stroke,
          lineWidth: inCycle ? 2 : 1,
          radius: 8,
          labelText: label,
          labelFill,
          labelFontSize: 11,
          labelLineHeight: 15,
          labelWordWrap: true,
          labelWordWrapWidth: 140,
          labelMaxLines: 3,
          labelTextAlign: 'center',
          labelTextBaseline: 'middle',
          cursor: 'pointer',
        },
      };
    });

  const edges = result.edges
    .filter((e) => e.from.endsWith('.vue') && e.to.endsWith('.vue'))
    .map((e) => ({
      source: e.from,
      target: e.to,
      style: { stroke: '#9aa4b0', lineWidth: 1, endArrow: true },
    }));

  try {
    graph = new Graph({
      container: el.value,
      data: { nodes, edges },
      layout: { type: 'dagre', rankdir: 'LR', nodesep: 30, ranksep: 100 },
      node: {
        type: 'rect',
        style: (d: any) => ({
          size: [160, 56],
          fill: '#3b82f6',
          stroke: '#1e40af',
          lineWidth: 1,
          radius: 8,
          labelFontSize: 11,
          labelLineHeight: 15,
          labelFill: '#ffffff',
          ...d.style,
        }),
      },
      edge: { style: { stroke: '#9aa4b0', lineWidth: 1 } },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      autoFit: 'view',
    });
    graph.on('node:click', (ev: any) => {
      const id = ev.target?.id || ev.item?.id;
      if (id) emit('select', id);
    });
    graph.on('canvas:click', () => {
      emit('select', null);
    });
    graph.render();
  } catch (e) {
    error.value = '依赖图渲染失败: ' + (e instanceof Error ? e.message : String(e));
  }
}

onMounted(() => rebuild());
watch(() => props.data, () => rebuild());
onBeforeUnmount(() => { try { graph?.destroy(); } catch {} });
</script>

<style scoped>
.gv-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.gv-canvas { width: 100%; height: 100%; background: var(--card); border: 1px solid var(--border); border-radius: 8px; min-height: 400px; }
</style>