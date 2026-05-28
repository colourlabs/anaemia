import type { AnaemiaConfig } from "@anaemia/core";
import { PluginItem } from "@babel/core";
export declare function createStyleRules(config: AnaemiaConfig): {
    client: {
        test: RegExp;
        type: string;
        use: {
            loader: string;
            options: {
                api: string;
            };
        }[];
    };
    server: {
        test: RegExp;
        type: string;
        generator: {
            css: {
                exportOnlyLocals: boolean;
            };
        };
        use: {
            loader: string;
            options: {
                api: string;
            };
        }[];
    };
};
export declare function createBabelRule({ isServer, isDev, plugins, }: {
    isServer: boolean;
    isDev: boolean;
    plugins?: PluginItem[];
}): {
    test: RegExp;
    use: {
        loader: string;
        options: {
            presets: (string | (string | {
                generate: string;
                hydratable: boolean;
                dev: boolean;
            })[])[];
            plugins: PluginItem[];
        };
    }[];
};
//# sourceMappingURL=rules.d.ts.map