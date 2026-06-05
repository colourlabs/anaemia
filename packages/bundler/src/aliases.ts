import path from "node:path";

export function getAliases(appRoot: string) {
  return {
    "~": path.resolve(appRoot, "./src"),
    "@app": path.resolve(appRoot, "./src/app"),
    "@features": path.resolve(appRoot, "./src/features"),
    "@entities": path.resolve(appRoot, "./src/entities"),
    "@shared": path.resolve(appRoot, "./src/shared"),
    "@routes": path.resolve(appRoot, "./src/routes"),
  };
}
