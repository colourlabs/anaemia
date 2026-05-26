import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { renderToString } from "solid-js/web";
import { ssrStorage, serverFunctionsRegistry } from "./context.js";
import fs from "node:fs";
import path from "node:path";

// @ts-ignore - mapped by Rspack
import App from "anaemia-user-app";

const app = new Hono();

app.use("/assets/*", serveStatic({ root: "./dist/client" }));

app.post("/_rpc", async (c) => {
  const functionId = c.req.query("id");

  if (!functionId || !serverFunctionsRegistry.has(functionId)) {
    return c.json({ error: "RPC function not found" }, 404);
  }

  const serverFn = serverFunctionsRegistry.get(functionId)!;
  const argumentsArray = await c.req.json();

  try {
    const result = await serverFn(...argumentsArray);
    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

let memoizedHtmlTemplate = "";
const templatePath = path.resolve(process.cwd(), "./dist/client/index.html");

try {
  if (fs.existsSync(templatePath)) {
    memoizedHtmlTemplate = fs.readFileSync(templatePath, "utf-8");
  }
} catch (err) {
  console.warn("template baseline index.html not available yet during bootstrapping.");
}

app.get("*", async (c) => {
  let template = memoizedHtmlTemplate;

  if (process.env.NODE_ENV !== "production" || !template) {
    try {
      template = fs.readFileSync(templatePath, "utf-8");
    } catch (e) {
      return c.text("anaemia engine error: the client distribution template 'index.html' is missing. run a build first.", 500);
    }
  }

  const store = new Map<string, any>();

  const htmlPayload = ssrStorage.run(store, () => {
    return renderToString(() => <App />);
  });

  const serializedData = JSON.stringify(Object.fromEntries(store)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  const dataScript = `<script id="__ANAEMIA_DATA__" type="application/json">${serializedData}</script>`;

  // this regex finds any tag with 'aneamia-entry', captures its attributes, and tracks its closing tag
  //    $1 = opening tag with all user attributes (e.g., '<div class="custom-lol" aneamia-entry>')
  //    $2 = the tag type name (e.g., 'div')
  //    $3 = any placeholder content inside the user template tag
  //    $4 = the matching closing tag (e.g., '</div>')
  const entryTagRegex = /(<([a-zA-Z0-9\-]+)[^>]*aneamia-entry[^>]*>)(.*?)(<\/\\2>)/is;

  let completeHtmlOutput = template;

  if (entryTagRegex.test(template)) {
    completeHtmlOutput = template.replace(entryTagRegex, `$1${htmlPayload}$4`);
  } else {
    completeHtmlOutput = template.replace("</body>", `<div aneamia-entry>${htmlPayload}</div></body>`);
  }

  if (completeHtmlOutput.includes("")) {
    completeHtmlOutput = completeHtmlOutput.replace("", dataScript);
  } else {
    completeHtmlOutput = completeHtmlOutput.replace("</body>", `${dataScript}</body>`);
  }

  return c.html(completeHtmlOutput);
});

const port = Number(process.env.PORT) || 3000;

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`[anaemia framework] Server steaming live at http://localhost:${info.port}`);
});

export default app;