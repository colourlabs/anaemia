import { createServerFunctionId } from "../server-function-id.js";

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

          const serverFunctionCallback = path.node.arguments[0];
          const explicitId = path.node.arguments[1];

          const functionHash = t.isStringLiteral(explicitId)
            ? explicitId.value
            : createServerFunctionId(filename, path.node.start);

          if (serverFunctionCallback) {
            path.get('arguments.0').remove();
          }

          // this whole thing is just magic bro
          path.replaceWith(
            t.callExpression(
              t.arrowFunctionExpression(
                [],
                t.blockStatement([
                  t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.identifier("_rpc"),
                      t.arrowFunctionExpression(
                        [t.restElement(t.identifier("args"))],
                        t.callExpression(
                          t.callExpression(t.identifier("$$executeClientRpc"), [
                            t.stringLiteral(functionHash)
                          ]),
                          [t.spreadElement(t.identifier("args"))]
                        )
                      )
                    )
                  ]),
                  // ✅ Inside the blockStatement array, not a 3rd arg to arrowFunctionExpression
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(t.identifier("_rpc"), t.identifier("id")),
                      t.stringLiteral(functionHash)
                    )
                  ),
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      t.memberExpression(t.identifier("_rpc"), t.identifier("readHydrationCache")),
                      t.arrowFunctionExpression(
                        [t.identifier("sourceArg")],
                        t.blockStatement([
                          t.variableDeclaration("const", [
                            t.variableDeclarator(
                              t.identifier("__el"),
                              t.callExpression(
                                t.memberExpression(t.identifier("document"), t.identifier("getElementById")),
                                [t.stringLiteral("__ANAEMIA_DATA__")]
                              )
                            )
                          ]),
                          t.ifStatement(
                            t.unaryExpression("!", t.identifier("__el")),
                            t.returnStatement(t.identifier("undefined"))
                          ),
                          t.tryStatement(
                            t.blockStatement([
                              t.variableDeclaration("const", [
                                t.variableDeclarator(
                                  t.identifier("__data"),
                                  t.callExpression(
                                    t.memberExpression(t.identifier("JSON"), t.identifier("parse")),
                                    [t.memberExpression(t.identifier("__el"), t.identifier("textContent"))]
                                  )
                                )
                              ]),
                              t.variableDeclaration("const", [
                                t.variableDeclarator(
                                  t.identifier("__cache"),
                                  t.optionalMemberExpression(
                                    t.memberExpression(
                                      t.identifier("__data"),
                                      t.identifier("__SERVER_FUNCTION_DATA__")
                                    ),
                                    t.stringLiteral(functionHash),
                                    true,
                                    true
                                  )
                                )
                              ]),
                              t.ifStatement(
                                t.unaryExpression("!", t.identifier("__cache")),
                                t.returnStatement(t.identifier("undefined"))
                              ),
                              t.returnStatement(
                                t.memberExpression(
                                  t.identifier("__cache"),
                                  t.callExpression(
                                    t.memberExpression(t.identifier("JSON"), t.identifier("stringify")),
                                    [t.arrayExpression([t.identifier("sourceArg")])]
                                  ),
                                  true
                                )
                              )
                            ]),
                            t.catchClause(
                              t.identifier("_"),
                              t.blockStatement([t.returnStatement(t.identifier("undefined"))])
                            )
                          )
                        ])
                      )
                    )
                  ),
                  t.returnStatement(t.identifier("_rpc"))
                ])
              ),
              []
            )
          );
        }
      }
    },
  };
}