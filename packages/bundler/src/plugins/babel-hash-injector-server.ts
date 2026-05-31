import { createServerFunctionId } from "../server-function-id.js";
import type { NodePath, PluginPass, types as BabelTypes, PluginObj } from "@babel/core";

export default function serverHashInjector({ types: t }: { types: typeof BabelTypes }): PluginObj<PluginPass> {
  return {
    name: "anaemia-server-hash-injector",
    visitor: {
      CallExpression(path: NodePath<BabelTypes.CallExpression>, state: PluginPass) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === "runOnServer") {
          const filename = state.file.opts.filename || "unknown";
          const functionHash = createServerFunctionId(filename, path.node.start);

          if (path.node.arguments.length === 1) {
            path.node.arguments.push(t.stringLiteral(functionHash));
          }
        }
      },
    },
  };
}
