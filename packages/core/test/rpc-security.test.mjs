import test from "node:test";
import assert from "node:assert/strict";

const {
  createRpcToken,
  verifyRpcToken,
  setRpcSecret,
  verifyOrigin,
  readBodyWithLimit,
  PayloadTooLargeError,
  DEFAULT_MAX_RPC_BODY_BYTES,
} = await import("../dist/runtime/server/rpc/security.js");

setRpcSecret("rpc-security-test-secret");

test("createRpcToken produces a token that verifies", () => {
  const token = createRpcToken();
  assert.equal(typeof token, "string");
  assert.ok(token.includes("."));
  assert.equal(verifyRpcToken(token), true);
});

test("verifyRpcToken rejects null, undefined and malformed values", () => {
  assert.equal(verifyRpcToken(null), false);
  assert.equal(verifyRpcToken(undefined), false);
  assert.equal(verifyRpcToken(""), false);
  assert.equal(verifyRpcToken("no-dot-here"), false);
  assert.equal(verifyRpcToken("AAAA.BBBB"), false);
});

test("verifyRpcToken rejects tokens signed under a different secret", () => {
  setRpcSecret("other-secret");
  const foreign = createRpcToken();
  setRpcSecret("rpc-security-test-secret");
  assert.equal(verifyRpcToken(foreign), false);
});

test("expired tokens are rejected", () => {
  const expired = createRpcToken({ ttlSeconds: -10 });
  assert.equal(verifyRpcToken(expired), false);
});

test("tampering with the payload invalidates the signature", () => {
  const token = createRpcToken();
  const [body, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  payload.exp = payload.exp + 1_000_000;
  const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
  assert.equal(verifyRpcToken(forged), false);
});

test("verifyOrigin accepts same-origin and no-origin requests", () => {
  const c = { req: { url: "http://localhost:3000/", header: () => undefined } };
  assert.equal(verifyOrigin(c), true);

  const sameOrigin = {
    req: { url: "http://localhost:3000/", header: (name) => (name === "origin" ? "http://localhost:3000" : undefined) },
  };
  assert.equal(verifyOrigin(sameOrigin), true);
});

test("verifyOrigin rejects cross-origin and malformed origins", () => {
  const cross = {
    req: { url: "http://localhost:3000/", header: (name) => (name === "origin" ? "https://evil.example" : undefined) },
  };
  assert.equal(verifyOrigin(cross), false);

  const malformed = {
    req: { url: "http://localhost:3000/", header: (name) => (name === "referer" ? "not a url" : undefined) },
  };
  assert.equal(verifyOrigin(malformed), false);
});

test("verifyOrigin rejects cross-site sec-fetch-site values", () => {
  const c = {
    req: {
      url: "http://localhost:3000/",
      header: (name) => (name === "sec-fetch-site" ? "cross-site" : undefined),
    },
  };
  assert.equal(verifyOrigin(c), false);
});

test("verifyOrigin honors an extra allowlisted origin", () => {
  const c = {
    req: { url: "http://localhost:3000/", header: (name) => (name === "origin" ? "https://stage.example" : undefined) },
  };
  assert.equal(verifyOrigin(c, ["https://stage.example"]), true);
});

test("readBodyWithLimit allows bodies within the limit", async () => {
  const req = new Request("http://localhost/_rpc", {
    method: "POST",
    body: JSON.stringify([1, 2, 3]),
  });
  const text = await readBodyWithLimit(req, DEFAULT_MAX_RPC_BODY_BYTES);
  assert.equal(JSON.parse(text)[0], 1);
});

test("readBodyWithLimit throws PayloadTooLargeError above the limit", async () => {
  const enc = new TextEncoder();
  let offset = 0;
  const payload = JSON.stringify(["A".repeat(1_000_000)]);
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= payload.length) {
        controller.close();
        return;
      }
      const chunk = enc.encode(payload.slice(offset, offset + 16384));
      offset += chunk.length;
      controller.enqueue(chunk);
    },
  });

  const req = new Request("http://localhost/_rpc", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  await assert.rejects(
    () => readBodyWithLimit(req, 64),
    (error) => error instanceof PayloadTooLargeError,
  );
});

test("readBodyWithLimit returns empty string for an empty body", async () => {
  const req = new Request("http://localhost/_rpc", { method: "POST", body: "" });
  assert.equal(await readBodyWithLimit(req, 100), "");
});
