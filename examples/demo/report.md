# Vue 组件依赖分析报告

**项目根目录**: `D:\_myproject\component-skills\examples\demo`

**扫描到的组件文件数**: 7

**循环依赖(强连通分量数)**: 1
**疑似无用组件数**: 1

---

## 🔄 循环依赖 (1)

### 环 #1

```
src/components/A.vue
src/components/B.vue
```

---

## 🗑️ 疑似无用组件 (1)

> 这些组件没有被任何入口或其他组件引用，可能是未使用的遗留代码。请人工确认是否可删除。

```
src/components/Dead.vue
```
---

## 🚪 入口组件 (1)

```
src/App.vue
```

---

## 📊 依赖边 (6)

```
src/App.vue  ->  src/components/Button.vue
src/App.vue  ->  src/components/Home.vue
src/components/A.vue  ->  src/components/B.vue
src/components/B.vue  ->  src/components/A.vue
src/components/Card.vue  ->  src/components/B.vue
src/components/Home.vue  ->  src/components/Card.vue
```


===== Mermaid 依赖图 =====

graph TD
  M0["App"];
  M1["A"];
  M2["B"];
  M3["Button"];
  M4["Card"];
  M5["Dead"];
  M6["Home"];
  M0 --> M3;
  M0 --> M6;
  M1 --> M2;
  M2 --> M1;
  M4 --> M2;
  M6 --> M4;
  class M1,M2 cycle;
  classDef cycle fill:#fbb,stroke:#d00;
