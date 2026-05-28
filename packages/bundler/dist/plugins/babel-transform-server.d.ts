export default function clientServerFnTransform({ types: t }: any): {
    name: string;
    visitor: {
        Program: {
            enter(path: any, state: any): void;
            exit(path: any, state: any): void;
        };
        CallExpression(path: any, state: any): void;
    };
};
//# sourceMappingURL=babel-transform-server.d.ts.map