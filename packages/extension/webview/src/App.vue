<template>
  <div class="app-root">
    <div class="app-header">
      <h1>Vue 组件依赖分析</h1>
      <div class="toolbar">
        <input
          v-model="projectPath"
          placeholder="项目根目录，如 D:/my-app 或 /Users/me/app"
          @keyup.enter="run"
        />
        <button :disabled="busy || !projectPath" @click="run" v-html="busy ? '分析中…' : '开始分析'"></button>
      </div>
      <div class="error" v-if="error">{{ error }}</div>
    </div>

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

    <!-- 主区域：dagre 依赖图 + 底部栏 -->
    <div class="main-area" v-if="result">
      <div class="graph-panel">
        <GraphView :data="result" @select="onSelectNode" />
      </div>
      <div class="bottom-panel">
        <div class="bottom-tabs">
          <button class="btab" :class="{active: btab==='stats'}" @click="btab='stats'">扇入扇出</button>
          <button class="btab" :class="{active: btab==='cycles'}" @click="btab='cycles'">循环依赖 ({{ result.cycles.length }})</button>
          <button class="btab" :class="{active: btab==='dead'}" @click="btab='dead'">无用组件 ({{ result.deadComponents.length }})</button>
          <button class="btab" :class="{active: btab==='layers'}" @click="btab='layers'">越层 ({{ result.layerViolations.length }})</button>
          <button class="btab" :class="{active: btab==='unresolved'}" @click="btab='unresolved'">未解析 ({{ result.unresolved.length }})</button>
        </div>
        <div class="bottom-content">
          <!-- 扇入扇出 -->
          <div v-if="btab==='stats'">
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
          <!-- 循环 -->
          <div v-else-if="btab==='cycles'">
            <template v-if="result.cycles.length">
              <div v-for="(c,i) in result.cycles" :key="i" style="margin-bottom:8px">
                <span class="badge danger">环 #{{ i+1 }}</span>
                <span class="mono">{{ c.components.join('  ↔  ') }}</span>
              </div>
            </template>
            <div class="empty" v-else>✅ 未检测到循环依赖。</div>
          </div>
          <!-- 无用 -->
          <div v-else-if="btab==='dead'">
            <template v-if="result.deadComponents.length">
              <p style="color:var(--muted);margin:0 0 6px">未被入口或其它组件引用，可能是遗留代码。</p>
              <div class="mono" v-for="d in result.deadComponents" :key="d">{{ d }}</div>
            </template>
            <div class="empty" v-else>✅ 无未使用组件。</div>
          </div>
          <!-- 越层 -->
          <div v-else-if="btab==='layers'">
            <template v-if="result.layerViolations.length">
              <p style="color:var(--muted);margin:0 0 6px">低层组件引用了更高层组件，依赖方向有问题：</p>
              <div class="mono" v-for="(v,i) in result.layerViolations" :key="i">{{ v.message }}</div>
            </template>
            <div class="empty" v-else>✅ 未发现越层引用。</div>
          </div>
          <!-- 未解析 -->
          <div v-else-if="btab==='unresolved'">
            <template v-if="result.unresolved.length">
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import GraphView from './GraphView.vue';
import { analyze, isWebview } from './api';
import type { AnalysisResult, ComponentNode } from '@shaohui_jin/comp-core';

const projectPath = ref('');
const result = ref<AnalysisResult | null>(null);
const error = ref('');
const busy = ref(false);
const btab = ref<'stats' | 'cycles' | 'dead' | 'layers' | 'unresolved'>('stats');

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

function onSelectNode(path: string | null) {
  // 选中节点时，可以在底部栏高亮该节点，或切换底部内容
  // 目前保留底部栏不受影响，但后续可扩展
}

onMounted(() => {
  // 自动从 URL 或 webview 初始消息读取 project
  const q = new URLSearchParams(window.location.search);
  const urlProject = q.get('project');
  if (urlProject) {
    projectPath.value = urlProject;
    run();
  }
  // 扩展 webview 中，宿主可能通过 postMessage 传初始 project
  if (isWebview()) {
    // 可通过 window.__initialProject__ 扩展注入
    // 当前扩展没有注入，交给用户手动输入或以后扩展增强
  }
});
</script>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  padding: 12px 16px;
  box-sizing: border-box;
}
.app-header {
  flex-shrink: 0;
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 8px;
}
.graph-panel {
  flex: 1;
  min-height: 0;
  margin-bottom: 8px;
}
.bottom-panel {
  flex-shrink: 0;
  height: 220px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  overflow: hidden;
}
.bottom-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 4px 0;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.btab {
  padding: 5px 12px;
  cursor: pointer;
  color: var(--muted);
  border: none;
  background: transparent;
  font-size: 12px;
  border-radius: 6px 6px 0 0;
}
.btab.active {
  color: var(--accent);
  background: var(--bg);
  font-weight: 600;
}
.bottom-content {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  min-height: 0;
}
</style>