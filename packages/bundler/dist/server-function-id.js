export function createServerFunctionId(filename, start) {
    return Buffer.from(`${filename}:${start ?? 0}`).toString("base64url");
}
