import test from "node:test";
import assert from "node:assert/strict";
import { flattenWsMessage } from "../../dist/utils/flatten-ws-message.js";

test("flattenWsMessage handles a plain string", () => {
  assert.equal(flattenWsMessage("hello"), "hello");
});

test("flattenWsMessage handles a single Buffer", () => {
  const buf = Buffer.from("hello");
  assert.equal(flattenWsMessage(buf), "hello");
});

test("flattenWsMessage concatenates a Buffer array", () => {
  const bufs = [Buffer.from("hel"), Buffer.from("lo")];
  assert.equal(flattenWsMessage(bufs), "hello");
});