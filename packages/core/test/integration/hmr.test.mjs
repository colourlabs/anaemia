import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url);

async function resolveConfigPort() {
  const configPath = path.resolve(projectRoot, "anaemia.config.ts");

  if (fs.existsSync(configPath)) {
    try {
      const userConfigModule = await jiti.import(configPath);
      const userConfig = userConfigModule.default || userConfigModule;

      if (userConfig && typeof userConfig.port === "number") {
        return userConfig.port;
      }
    } catch (err) {
      console.warn(`[HMR test warning]: failed parsing anaemia.config.ts, falling back to port 3000. Error: ${err.message}`);
    }
  }

  return 3000;
}

const TARGET_PORT = resolveConfigPort();
const BASE_URL = `http://localhost:${TARGET_PORT}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../../templates/base-app");
const componentPath = path.resolve(projectRoot, "src/features/welcome-hero/components/WelcomeHero.tsx");

test("integration - dev server HMR & hydration lifecycle", async (t) => {
  let devProcess = null;
  let browser = null;
  let page = null;
  let consoleErrors = [];
  const originalComponentContent = fs.readFileSync(componentPath, "utf-8");

  t.after(async () => {
    fs.writeFileSync(componentPath, originalComponentContent, "utf-8");
    if (browser) await browser.close();

    if (devProcess && devProcess.pid) {
      process.kill(-devProcess.pid, "SIGKILL");
    }
  });

  t.beforeEach(() => {
    consoleErrors = [];
  });

  await t.test("should start dev server without errors", async () => {
    devProcess = spawn("pnpm", ["dev"], {
      cwd: projectRoot,
      stdio: "pipe",
      detached: true,
    });

    await new Promise((resolve, reject) => {
      let output = "";

      const timeout = setTimeout(() => {
        reject(new Error(`Dev server startup timed out. Current output:\n${output}`));
      }, 15000);

      const checkPortReady = async () => {
        for (let i = 0; i < 20; i++) {
          // Dynamic URL Check
          const res = await fetch(BASE_URL);
          if (res.status === 200 || res.status === 404) {
            clearTimeout(timeout);
            resolve();
            return;
          }

          await new Promise((r) => setTimeout(r, 200));
        }
        reject(new Error(`Server process started but port ${TARGET_PORT} never responded to HTTP requests.`));
      };

      devProcess.stdout.on("data", (data) => {
        output += data.toString();

        if (output.includes("server live at") || output.includes(BASE_URL)) {
          checkPortReady();
        }
      });

      devProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (!msg.includes("ExperimentalWarning") && !msg.includes("sync error")) {
          console.error(`[Server Stderr]: ${msg}`);
        }
      });

      devProcess.on("error", reject);
    });
  });

  await t.test("should render initial server state & connect HMR", async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.on("pageerror", (err) => consoleErrors.push(err));

    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    const titleText = await page.textContent("h1");
    assert.equal(titleText.trim(), "anaemia");
    assert.equal(consoleErrors.length, 0, `Errors during initial render: ${consoleErrors.map((e) => e.message).join(", ")}`);
  });

  await t.test("should push hot module updates to browser when files change", async () => {
    const updatedContent = originalComponentContent.replace(`<h1 class={styles.title}>anaemia</h1>`, `<h1 class={styles.title}>anaemia updated!</h1>`);

    assert.notEqual(originalComponentContent, updatedContent, "Regex failed to modify component text.");
    fs.writeFileSync(componentPath, updatedContent, "utf-8");

    await page.waitForFunction(
      () => {
        // eslint-disable-next-line no-undef
        const h1 = document.querySelector("h1");
        return h1 && h1.textContent.trim() === "anaemia updated!";
      },
      { timeout: 10000 }
    );
  });

  await t.test("should refresh page without throwing runtime errors", async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));

    await page.reload({ waitUntil: "networkidle" });

    const titleText = await page.textContent("h1");
    assert.equal(titleText.trim(), "anaemia updated!");
    assert.equal(consoleErrors.length, 0, `Errors detected after page refresh: ${consoleErrors.map((e) => e.message).join(", ")}`);
  });
});
