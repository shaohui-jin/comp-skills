<template>
  <h1>Vue 组件依赖分析</h1>

  <div class="toolbar">
    <input
      v-model="projectPath"
      placeholder="项目根目录，如 D:/my-app 或 /Users/me/app"
      @keyup.enter="run"
    />
    <button :disabled="busy || !projectPath" @click="run" v-html="busy ? '分析中…' : '开始分析'"></button>
    <button @click="pickFromUrl" title="读取 URL 里的 project 参数">读取 URL</button>
  </div>

  <div class="error" v-if="error">{{ error }}</div>

  <!-- 概览指标 -->
  <div class="metric-grid" v-if="result">
    <div class="metric"><div class="num">{{ result.fileCount }}</div><div class="label">组件文件</div></div>
    <div class="metric">
      <div class="num" :style="{color: result.cycles.length ? 'var(--danger)' : 'var(--ok)'}">{{ result.cycles.length }}</div>
      <div class="label">循环依赖</div>
    </div>
    <div class="metric">
      <div class="num" :style="{color: result.deadComponents.length ? 'var(--warn)' : 'var(--ok)'}">{{ result.deadComponents.length }}</div>
      <div class="label">无用组件</div>
    </div>
    <div class="metric">
      <div class="num" :style="{color: result.layerViolations.length ? 'var(--warn)' : 'var(--ok)'}">{{ result.layerViolations.length }}</div>
      <div class="label">越层引用</div>
    </div>
    <div class="metric">
      <div class="num">{{ result.edges.length }}</div>
      <div class="label">依赖边</div>
    </div>
    <div class="metric">
      <div class="num">{{ result.unresolved.length }}</div>
      <div class="label">未解析引用</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs" v-if="result">
    <button class="tab" :class="{active: tab==='graph'}" @click="tab='graph'; drillPath=null">目录脑图</button>
    <button class="tab" :class="{active: tab==='overview'}" @click="tab='overview'; drillPath=null">全量侧重图</button>
    <button class="tab" :class="{active: tab==='cycles'}" @click="tab='cycles'">循环依赖 ({{ result.cycles.length }})</button>
    <button class="tab" :class="{active: tab==='dead'}" @click="tab='dead'">无用组件 ({{ result.deadComponents.length }})</button>
    <button class="tab" :class="{active: tab==='stats'}" @click="tab='stats'">扇入扇出</button>
    <button class="tab" :class="{active: tab==='layers'}" @click="tab='layers'">越层 ({{ result.layerViolations.length }})</button>
    <button class="tab" :class="{active: tab==='unresolved'}" @click="tab='unresolved'">未解析 ({{ result.unresolved.length }})</button>
  </div>

  <!-- 目录脑图 / 下钻 -->
  <DrilldownView
    v-if="tab==='graph' && drillPath"
    :data="result"
    :center="drillPath"
    @back="drillPath=null"
  />
  <MindmapView
    v-else-if="tab==='graph'"
    :data="result"
    @open-component="drillPath=$event"
  />

  <!-- 全量侧重图 -->
  <OverviewView v-if="tab==='overview'" :data="result" />

  <!-- 循环依赖 -->
  <div v-else-if="tab==='cycles'" class="card">
    <template v-if="result && result.cycles.length">
      <div v-for="(c,i) in result.cycles" :key="i" style="margin-bottom:12px">
        <div class="badge danger">环 #{{ i+1 }}</div>
        <div class="mono">{{ c.components.join('  ↔  ') }}</div>
      </div>
    </template>
    <div class="empty" v-else>✅ 未检测到循环依赖。</div>
  </div>

  <!-- 无用组件 -->
  <div v-else-if="tab==='dead'" class="card">
    <template v-if="result && result.deadComponents.length">
      <p style="color:var(--muted)">未被入口或其它组件引用，可能是遗留代码。</p>
      <div class="mono" v-for="d in result.deadComponents" :key="d">{{ d }}</div>
    </template>
    <div class="empty" v-else>✅ 无未使用组件。</div>
  </div>

  <!-- 扇入扇出 -->
  <div v-else-if="tab==='stats'" class="card">
    <table class="data">
      <thead><tr><th>组件</th><th>扇入</th><th>扇出</th><th>层</th><th>状态</th></tr></thead>
      <tbody>
        <tr v-for="s in sortedStats" :key="s.path">
          <td class="mono">{{ s.path }}</td>
          <td>{{ s.fanIn }}</td>
          <td>{{ s.fanOut }}</td>
          <td>{{ s.layerName }}</td>
          <td>
            <span class="badge ok" v-if="s.used && !s.dead">在用</span>
            <span class="badge warn" v-else-if="s.dead">废弃</span>
            <span class="badge muted" v-else>？</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 越层 -->
  <div v-else-if="tab==='layers'" class="card">
    <template v-if="result && result.layerViolations.length">
      <p style="color:var(--muted)">低层组件引用了更高层组件，依赖方向有问题：</p>
      <div class="mono" v-for="(v,i) in result.layerViolations" :key="i">{{ v.message }}</div>
    </template>
    <div class="empty" v-else>✅ 未发现越层引用。</div>
  </div>

  <!-- 未解析 -->
  <div v-else-if="tab==='unresolved'" class="card">
    <template v-if="result && result.unresolved.length">
      <table class="data">
        <thead><tr><th>文件</th><th>语法</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="(u,i) in result.unresolved" :key="i">
            <td class="mono">{{ u.file }}</td>
            <td class="mono">{{ u.syntax }}</td>
            <td>{{ u.detail }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <div class="empty" v-else>✅ 无不解析引用。</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import MindmapView from './MindmapView.vue';
import DrilldownView from './DrilldownView.vue';
import OverviewView from './OverviewView.vue';
import { analyze, isWebview } from './api';
import type { AnalysisResult, ComponentNode } from '@shaohui_jin/comp-core';

const projectPath = ref('');
const result = ref<AnalysisResult | null>(null);
const error = ref('');
const busy = ref(false);
const tab = ref<'graph' | 'overview' | 'cycles' | 'dead' | 'stats' | 'layers' | 'unresolved'>('graph');
const drillPath = ref<string | null>(null);

const sortedStats = computed<ComponentNode[]>(() => {
  if (!result.value) return [];
  return [...result.value.nodeStats].sort(
    (a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path),
  );
});

async function run() {
  const p = projectPath.value.trim();
  if (!p || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    result.value = await analyze({ project: p, srcDir: 'src' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

function pickFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const p = q.get('project');
  if (p) {
    projectPath.value = p;
    run();
  } else {
    error.value = 'URL 没有 project 参数';
  }
}

onMounted(() => {
  if (isWebview() || new URLSearchParams(window.location.search).get('project')) {
    pickFromUrl();
  }
});
</script>
