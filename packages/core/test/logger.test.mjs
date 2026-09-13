import test from "node:test";
import assert from "node:assert/strict";

const { createLogger, consoleSink, getLogger, setLogger } = await import("../dist/runtime/server/logger.js");

test("createLogger fans each event out to every sink", () => {
  const events = [];
  const logger = createLogger([(event) => events.push(event)]);
  logger.info("hello", { a: 1 });
  logger.warn("careful");
  logger.error("boom", new Error("x"));
  logger.debug("dbg");

  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((e) => e.level),
    ["info", "warn", "error", "debug"],
  );
  assert.equal(events[0].message, "hello");
  assert.deepEqual(events[0].data, { a: 1 });
  assert.ok(typeof events[0].timestamp === "number");
});

test("createLogger with multiple sinks dispatches to all of them", () => {
  const primary = [];
  const secondary = [];
  const logger = createLogger([(event) => primary.push(event), (event) => secondary.push(event)]);
  logger.info("app started");

  assert.equal(primary.length, 1);
  assert.equal(secondary.length, 1);
  assert.equal(primary[0].message, "app started");
  assert.equal(secondary[0].message, "app started");
});

test("setLogger / getLogger swap the process-wide logger", () => {
  const before = getLogger();
  const events = [];
  const custom = createLogger([(event) => events.push(event)]);
  setLogger(custom);
  assert.equal(getLogger(), custom);
  getLogger().error("moved");
  assert.equal(events.length, 1);
  assert.equal(events[0].message, "moved");
  setLogger(before);
  assert.equal(getLogger(), before);
});

test("consoleSink does not throw and uses console methods", () => {
  const originalStdout = process.stdout.write;
  const captured = [];
  process.stdout.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  try {
    consoleSink({ level: "info", message: "one", timestamp: 0 });
    assert.match(captured.join(""), /\[anaemia\] one/);
  } finally {
    process.stdout.write = originalStdout;
  }
});
