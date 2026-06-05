# @anaemia/eslint-plugin

ESLint plugin for anaemia apps. Provides a pre-configured flat config with TypeScript support, browser/server context globals, and enforced layer boundary rules.

## installation

```bash
pnpm add -D @anaemia/eslint-plugin
```

If your project uses TypeScript, also install the TypeScript ESLint packages:

```bash
pnpm add -D @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

## usage

```typescript
import { anaemia } from "@anaemia/eslint-plugin";

export default await anaemia();
```

To disable TypeScript rules:

```typescript
export default await anaemia({ typescript: false });
```

## what's included

- `@eslint/js` recommended rules
- TypeScript ESLint recommended rules (when TypeScript is enabled)
- Browser globals for client-side files (`src/**/*.tsx`, `src/shared/**`, `src/entities/**`, `src/features/**`)
- Node globals for server-side files (`**/*.server.ts`, `src/routes/**`, `**/*.config.ts`)
- Layer boundary enforcement via `eslint-plugin-boundaries`

## layer boundaries

The plugin enforces anaemia's feature-sliced architecture. Imports must follow this hierarchy:

```
app -> routes -> features -> entities -> shared
```

Each layer may only import from layers below it. Violations are reported as errors.

## options

| Option       | Type      | Default | Description                                                                                                  |
| ------------ | --------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `typescript` | `boolean` | `true`  | enable TypeScript ESLint rules. Requires `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`. |
