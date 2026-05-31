import type { AstNode } from "./ast-walker.js";

export function prop<T = unknown>(node: AstNode, key: string): T {
  return (node as Record<string, unknown>)[key] as T;
}

export function child(node: AstNode, key: string): AstNode | null {
  const value = (node as Record<string, unknown>)[key];
  if (value && typeof value === "object" && typeof (value as AstNode).type === "string") {
    return value as AstNode;
  }
  return null;
}

export function children(node: AstNode, key: string): AstNode[] {
  const value = (node as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is AstNode =>
    Boolean(v && typeof v === "object" && typeof (v as AstNode).type === "string"),
  );
}
