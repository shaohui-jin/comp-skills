/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  acquireVsCodeApi?: () => {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
}
