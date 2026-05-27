export default function clientServerFnTransform({ types: t }: any) {
  return {
    name: "anaemia-client-server-fn-transform",
    visitor: {
      Program(state: any) {
        state.serverFnCounter = 0;
      },
      CallExpression(path: any, state: any) {
        if (path.node.callee.name === "runOnServer") {
          const filename = state.file.opts.filename || "unknown";
          
          state.serverFnCounter++;
          const relativePath = filename.replace(process.cwd(), "");
          const functionHash = Buffer.from(`${relativePath}:${state.serverFnCounter}`).toString("base64url");

          path.replaceWith(
            t.arrowFunctionExpression(
              [t.restElement(t.identifier("args"))],
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.identifier("cache"),
                    t.logicalExpression(
                      "||",
                      t.logicalExpression(
                        "&&",
                        t.binaryExpression("!==", t.unaryExpression("typeof", t.identifier("window")), t.stringLiteral("undefined")),
                        t.memberExpression(t.identifier("window"), t.identifier("__ANAEMIA_CACHE__"))
                      ),
                      t.parenthesizedExpression(
                        t.conditionalExpression(
                          t.binaryExpression("!==", t.unaryExpression("typeof", t.identifier("window")), t.stringLiteral("undefined")),
                          t.assignmentExpression(
                            "=",
                            t.memberExpression(t.identifier("window"), t.identifier("__ANAEMIA_CACHE__")),
                            t.callExpression(t.memberExpression(t.identifier("JSON"), t.identifier("parse")), [
                              t.logicalExpression(
                                "||",
                                t.memberExpression(
                                  t.callExpression(t.memberExpression(t.identifier("document"), t.identifier("getElementById")), [
                                    t.stringLiteral("__ANAEMIA_DATA__"),
                                  ]),
                                  t.identifier("textContent")
                                ),
                                t.stringLiteral("{}")
                              ),
                            ])
                          ),
                          t.objectExpression([])
                        )
                      )
                    )
                  ),
                ]),

                t.ifStatement(
                  t.logicalExpression(
                    "&&",
                    t.identifier("cache"),
                    t.logicalExpression(
                      "&&",
                      t.memberExpression(t.identifier("cache"), t.identifier("__LOADER_DATA__")),
                      t.binaryExpression(
                        "in",
                        t.stringLiteral(functionHash),
                        t.memberExpression(t.identifier("cache"), t.identifier("__LOADER_DATA__"))
                      )
                    )
                  ),
                  t.blockStatement([
                    t.returnStatement(
                      t.callExpression(t.memberExpression(t.identifier("Promise"), t.identifier("resolve")), [
                        t.memberExpression(
                          t.memberExpression(t.identifier("cache"), t.identifier("__LOADER_DATA__")),
                          t.stringLiteral(functionHash),
                          true
                        ),
                      ])
                    ),
                  ])
                ),

                t.returnStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(t.identifier("fetch"), [
                        t.stringLiteral(`/_rpc?id=${functionHash}`),
                        t.objectExpression([
                          t.objectProperty(t.stringLiteral("method"), t.stringLiteral("POST")),
                          t.objectProperty(
                            t.stringLiteral("headers"),
                            t.objectExpression([
                              t.objectProperty(t.stringLiteral("Content-Type"), t.stringLiteral("application/json"))
                            ])
                          ),
                          t.objectProperty(
                            t.stringLiteral("body"),
                            t.callExpression(t.memberExpression(t.identifier("JSON"), t.identifier("stringify")), [t.identifier("args")])
                          ),
                        ]),
                      ]),
                      t.identifier("then")
                    ),
                    [t.arrowFunctionExpression([t.identifier("r")], t.callExpression(t.memberExpression(t.identifier("r"), t.identifier("json")), []))]
                  )
                ),
              ])
            )
          );
        }
      },
    },
  };
}