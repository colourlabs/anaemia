import * as tar from "tar";
import logger from "./logger.js";

const TAR_URL = "https://codeload.github.com/colourlabs/anaemia/tar.gz/main";

export async function fetchTemplate(targetPath: string): Promise<void> {
  logger.info("downloading template...");

  const res = await fetch(TAR_URL);
  if (!res.ok) throw new Error(`failed to download template: ${res.statusText}`);

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract({
      cwd: targetPath,
      strip: 3,
      filter: (p: string) => p.startsWith("anaemia-main/templates/base-app"),
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    const reader = res.body!.getReader();

    const pump = async () => {
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
