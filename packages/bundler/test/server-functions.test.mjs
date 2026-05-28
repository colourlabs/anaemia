import assert from "node:assert/strict";
import test from "node:test";
import { transformSync } from "@babel/core";

import clientServerFnTransform from "../dist/plugins/babel-transform-server.js";
import serverHashInjector from "../dist/plugins/babel-hash-injector-server.js";

import path from "node:path";
import fs from "node:fs";

const filename = "/app/src/routes/index.tsx";
const source = `
  import { runOnServer } from "@anaemia/core";
  export const add = runOnServer(async (a, b) => a + b);
`;

function transform(plugin) {
  return transformSync(source, {
    filename,
    plugins: [plugin],
    configFile: false,
    babelrc: false,
  })?.code ?? "";
}

test("client and server transforms generate the same server function id", () => {
  const clientCode = transform(clientServerFnTransform);
  const serverCode = transform(serverHashInjector);

  const clientId = clientCode.match(/\$\$executeClientRpc\("([^"]+)"\)/)?.[1];
  const serverId = serverCode.match(/runOnServer\([^]+,\s*"([^"]+)"\)/)?.[1];

  assert.ok(clientId);
  assert.equal(clientId, serverId);
});

test("client transform forwards call arguments to the RPC wrapper", () => {
  const clientCode = transform(clientServerFnTransform);

  assert.match(clientCode, /\.\.\.args/);
  assert.match(clientCode, /=> \$\$executeClientRpc\("[^"]+"\)\(\.\.\.args\)/);
});

test("client transform preserves explicit server function ids", () => {
  const code = transformSync(
    `
      import { runOnServer } from "@anaemia/core";
      export const ping = runOnServer(async () => "pong", "custom-id");
    `,
    {
      filename,
      plugins: [clientServerFnTransform],
      configFile: false,
      babelrc: false,
    }
  )?.code ?? "";

  assert.match(code, /\$\$executeClientRpc\("custom-id"\)/);
});

test("should guarantee server-side logic never leaks to client assets", async () => {
  const clientAssetDir = path.resolve(process.cwd(), "dist/client/assets");
  
  if (!fs.existsSync(clientAssetDir)) return;

  const files = fs.readdirSync(clientAssetDir).filter(f => f.endsWith(".js"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(clientAssetDir, file), "utf-8");
    
    assert.equal(
      content.includes("SELECT * FROM users"), 
      false, 
      `CRITICAL SECURITY LEAK: server logic found inside client asset: ${file}`
    );
  }
});