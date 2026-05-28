import { createServerFunctionId } from "../server-function-id.js";
export default function serverHashInjector({ types: t }) {
    return {
        name: "anaemia-server-hash-injector",
        visitor: {
            CallExpression(path, state) {
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
