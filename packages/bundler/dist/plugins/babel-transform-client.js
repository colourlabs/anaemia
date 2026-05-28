export default function anaemiaClientTransformer({ types: t }) {
    const serverFunctionIdentifiers = new Set();
    return {
        name: "anaemia-client-transformer",
        visitor: {
            Program: {
                enter() {
                    serverFunctionIdentifiers.clear();
                }
            },
            VariableDeclarator(path) {
                const init = path.node.init;
                if (init &&
                    t.isCallExpression(init) &&
                    t.isIdentifier(init.callee) &&
                    init.callee.name === "runOnServer") {
                    if (t.isIdentifier(path.node.id)) {
                        serverFunctionIdentifiers.add(path.node.id.name);
                    }
                }
            },
            CallExpression(path) {
                const { callee, arguments: args } = path.node;
                if (t.isIdentifier(callee) && callee.name === "createResource") {
                    if (args.length === 2) {
                        const fetcherArg = args[1];
                        if (t.isIdentifier(fetcherArg) && serverFunctionIdentifiers.has(fetcherArg.name)) {
                            const fetcherName = fetcherArg.name;
                            const sourceArg = args[0];
                            let cacheCallExpression;
                            if (t.isArrowFunctionExpression(sourceArg) || t.isFunctionExpression(sourceArg)) {
                                const body = sourceArg.body;
                                const paramValue = t.isBlockStatement(body) ? null : (body);
                                cacheCallExpression = t.conditionalExpression(t.binaryExpression("===", t.unaryExpression("typeof", t.memberExpression(t.identifier(fetcherName), t.identifier("readHydrationCache"))), t.stringLiteral("function")), t.callExpression(t.memberExpression(t.identifier(fetcherName), t.identifier("readHydrationCache")), paramValue ? [paramValue] : []), t.identifier("undefined"));
                            }
                            else {
                                cacheCallExpression = t.callExpression(t.memberExpression(t.identifier(fetcherName), t.identifier("readHydrationCache")), [sourceArg]);
                            }
                            const optionsObject = t.objectExpression([
                                t.objectProperty(t.identifier("initialValue"), cacheCallExpression)
                            ]);
                            path.node.arguments.push(optionsObject);
                        }
                    }
                }
            }
        }
    };
}
