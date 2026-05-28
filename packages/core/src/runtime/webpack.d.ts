interface ImportMeta {
  webpackHot?: {
    accept(dep: string | string[], callback?: () => void): void;
    dispose(callback: (data: unknown) => void): void;
  };
}