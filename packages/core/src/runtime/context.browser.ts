export const ssrStorage = null as any;
export const serverFunctionsRegistry = new Map<string, Function>();

// runOnServer calls are compiled away by babel-transform-server
export const runOnServer = null as any;