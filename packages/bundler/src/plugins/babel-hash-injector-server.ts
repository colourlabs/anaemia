export default function serverHashInjector({ types: t }: any) {
  return {
    name: "anaemia-server-hash-injector",
    visitor: {
      CallExpression(path: any, state: any) {
        if (path.node.callee.name === "runOnServer") {
          const filename = state.file.opts.filename || "unknown";
          const functionHash = Buffer.from(`${filename}:${path.node.start}`).toString("base64url");

          if (path.node.arguments.length === 1) {
            path.node.arguments.push(t.stringLiteral(functionHash));
          }
        }
      }
    }
  };
}