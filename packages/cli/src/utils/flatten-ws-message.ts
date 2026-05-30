export function flattenWsMessage(data: Buffer | Buffer[] | ArrayBuffer | string): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf-8");
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf-8");
  return String(data);
}