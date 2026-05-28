export default function serverHashInjector({ types: t }: any): {
    name: string;
    visitor: {
        CallExpression(path: any, state: any): void;
    };
};
//# sourceMappingURL=babel-hash-injector-server.d.ts.map