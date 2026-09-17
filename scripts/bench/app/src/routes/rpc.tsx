import { runOnServer, registerRpcPolicy } from "@anaemia/core";

const echo = runOnServer(async (value: string) => ({ echo: value, when: Date.now() }), "bench-echo");

// /_rpc is deny-by-default; the benchmark harness has no auth by design.
registerRpcPolicy(echo.id, { allow: () => true });

export default function Rpc() {
  return (
    <main>
      <h1>rpc</h1>
      <p>registers bench-echo - POST /_rpc?id=bench-echo with a page token</p>
    </main>
  );
}
