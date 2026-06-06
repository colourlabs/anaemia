import * as tar from "tar";
import logger from "./logger.js";

const {
  default: { version },
} = await import("../../package.json", { with: { type: "json" } });

const TAR_URL = `https://codeload.github.com/colourlabs/anaemia/tar.gz/refs/tags/v${version}`;

export async function fetchTemplate(targetPath: string): Promise<void> {
  logger.info(`downloading template for v${version}...`);

  const res = await fetch(TAR_URL);
  if (!res.ok) throw new Error(`failed to download template: ${res.statusText}`);

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract({
      cwd: targetPath,
      strip: 3,
      filter: (p: string) => p.startsWith(`anaemia-${version}/templates/base-app`),
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    const reader = res.body!.getReader();

    const pump = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          extract.end();
          break;
        }
        extract.write(value);
      }
    };

    pump().catch(reject);
  });
}
