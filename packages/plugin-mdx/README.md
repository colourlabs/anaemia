# @anaemia/plugin-mdx

MDX support for [anaemia](https://github.com/colourlabs/anaemia). Write JSX components inside Markdown files.

## installation

```bash
pnpm add @anaemia/plugin-mdx
```

## usage

```ts
// anaemia.config.ts/js
import { defineConfig } from "@anaemia/core/config";
import { mdx } from "@anaemia/plugin-mdx";

export default defineConfig({
  plugins: [mdx()],
});
```

## options

```ts
mdx({
  remarkPlugins: [], // remark plugins to apply
  rehypePlugins: [], // rehype plugins to apply
});
```

### common plugins

```bash
pnpm add remark-gfm                    # GitHub flavored markdown (tables, strikethrough)
pnpm add remark-frontmatter            # frontmatter parsing
pnpm add remark-mdx-frontmatter        # expose frontmatter as exports
```

```ts
import { mdx } from "@anaemia/plugin-mdx";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";

export default defineConfig({
  plugins: [
    mdx({
      remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
    }),
  ],
});
```

## writing MDX

MDX files compile to SolidJS components and can be imported like any other component:

```tsx
import MyDoc from "./my-doc.mdx";

export default function Page() {
  return <MyDoc />;
}
```

You can use SolidJS components inside your MDX files:

```mdx
import { Button } from "../components/Button";

# Hello

<Button>Click me</Button>
```

## frontmatter

With `remark-frontmatter` and `remark-mdx-frontmatter`, frontmatter is exposed as named exports:

```mdx
---
title: My Page
date: 2024-01-01
---

# {frontmatter.title}
```

```tsx
import MyDoc, { frontmatter } from "./my-doc.mdx";

console.log(frontmatter.title); // "My Page"
```
