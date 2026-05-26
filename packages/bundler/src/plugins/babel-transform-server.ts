export default function clientServerFnTransform({ types: t }: any) {
  return {
    name: "anaemia-client-server-fn-transform",
    visitor: {
      CallExpression(path: any, state: any) {
        if (path.node.callee.name === "runOnServer") {
          const filename = state.file.opts.filename || "unknown";
          const functionHash = Buffer.from(`${filename}:${path.node.start}`).toString("base64url");

          // generates the self-contained client cache manager function expression
          path.replaceWith(
            t.arrowFunctionExpression(
              [t.restElement(t.identifier("args"))],
              t.blockStatement([
                // resolve or initialize the window cache
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

                // if this function's hash is cached inside the script data, return it immediately
                t.ifStatement(
                  t.logicalExpression("&&", t.identifier("cache"), t.binaryExpression("in", t.stringLiteral(functionHash), t.identifier("cache"))),
                  t.blockStatement([
                    t.variableDeclaration("const", [
                      t.variableDeclarator(t.identifier("res"), t.memberExpression(t.identifier("cache"), t.stringLiteral(functionHash), true)),
                    ]),
                    t.expressionStatement(t.unaryExpression("delete", t.memberExpression(t.identifier("cache"), t.stringLiteral(functionHash), true))),
                    t.returnStatement(t.callExpression(t.memberExpression(t.identifier("Promise"), t.identifier("resolve")), [t.identifier("res")])),
                  ])
                ),

                // fallback: run standard network RPC fetch call if navigating on client side later
                t.returnStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(t.identifier("fetch"), [
                        t.stringLiteral(`/_rpc?id=${functionHash}`),
                        t.objectExpression([
                          t.objectProperty(t.stringLiteral("method"), t.stringLiteral("POST")),
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