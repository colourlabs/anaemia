import path from "path";
export function getAliases(appRoot) {
    return {
        "~": path.resolve(appRoot, "./src"),
        "@core": path.resolve(appRoot, "./src/core"),
        "@shared": path.resolve(appRoot, "./src/shared"),
        "@features": path.resolve(appRoot, "./src/features"),
        "@routes": path.resolve(appRoot, "./src/routes"),
    };
}
