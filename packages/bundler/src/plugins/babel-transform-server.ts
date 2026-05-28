import { createServerFunctionId } from "./server-function-id.js";

export default function clientServerFnTransform({ types: t }: any) {
  return {
    name: "anaemia-client-server-fn-transform",
    visitor: {
      Program: {
        enter(path: any, state: any) {
          state.hasRunOnServer = false;
        },
        exit(path: any, state: any) {
          if (state.hasRunOnServer) {
            const importDeclaration = t.importDeclaration(
              [t.importSpecifier(t.identifier("$$executeClientRpc"), t.identifier("$$executeClientRpc"))],
              t.stringLiteral("@anaemia/core")
            );
            path.node.body.unshift(importDeclaration);
          }
        }
      },
      CallExpression(path: any, state: any) {
        if (path.node.callee.name === "runOnServer") {
          state.hasRunOnServer = true;
          const filename = state.file.opts.filename || "unknown";
          const explicitId = path.node.arguments[1];
          const functionHash = t.isStringLiteral(explicitId)
            ? explicitId.value
            : createServerFunctionId(filename, path.node.start);

          path.replaceWith(
            t.arrowFunctionExpression(
              [t.restElement(t.identifier("args"))],
              t.callExpression(
                t.callExpression(t.identifier("$$executeClientRpc"), [
                  t.stringLiteral(functionHash)
                ]),
                [t.spreadElement(t.identifier("args"))]
              )
            )
          );
        }
      }
    },
  };
}
