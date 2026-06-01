export function createServerFunctionId(filename: string, start: number | null | undefined): string {
  return btoa(`${filename}:${start ?? 0}`)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
