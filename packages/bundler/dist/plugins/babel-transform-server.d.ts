import type { PluginObj, PluginPass, types as BabelTypes } from "@babel/core";
interface PluginState extends PluginPass {
    hasRunOnServer: boolean;
}
export default function clientServerFnTransform({ types: t }: {
    types: typeof BabelTypes;
}): PluginObj<PluginState>;
export {};
//# sourceMappingURL=babel-transform-server.d.ts.map