export function createServerFunctionId(filename: string, start: number | null | undefined) {
  return Buffer.from(`${filename}:${start ?? 0}`).toString("base64url");
}
