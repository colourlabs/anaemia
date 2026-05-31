import { visitorKeys } from "oxc-parser";
import type { Program } from "oxc-parser";

export type AstNode = {
  type: string;
  [key: string]: unknown;
};

type WalkController = {
  skip: () => void;
};

export type AstWalker = {
  enter?: (node: AstNode, parent: AstNode | null, controller: WalkController) => void;
  leave?: (node: AstNode, parent: AstNode | null) => void;
};

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string");
}

function childKeysForNode(node: AstNode): string[] {
  const keysByNodeType = visitorKeys as Record<string, string[] | undefined>;
  const configuredKeys = keysByNodeType[node.type];
  if (configuredKeys) return configuredKeys;

  return Object.keys(node).filter((key) => {
    if (key === "type" || key === "start" || key === "end" || key === "range" || key === "loc") return false;
    const value = node[key];
    return isAstNode(value) || (Array.isArray(value) && value.some(isAstNode));
  });
}

export function walkAst(root: AstNode | Program, walker: AstWalker): void {
  const visit = (node: AstNode, parent: AstNode | null) => {
    const state = { skipped: false };
    const controller: WalkController = {
      skip() {
        state.skipped = true;
      },
    };

    walker.enter?.(node, parent, controller);

    if (!state.skipped) {
      for (const key of childKeysForNode(node)) {
        const value = node[key];

        if (Array.isArray(value)) {
          for (const child of value) {
            if (isAstNode(child)) visit(child, node);
          }
        } else if (isAstNode(value)) {
          visit(value, node);
        }
      }
    }

    walker.leave?.(node, parent);
  };

  visit(root as AstNode, null);
}
