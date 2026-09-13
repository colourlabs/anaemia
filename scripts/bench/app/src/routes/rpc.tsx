import { runOnServer } from "@anaemia/core";

const echo = runOnServer(async (value: string) => ({ echo: value, when: Date.now() }), "bench-echo");

export default function Rpc() {
  return (
    <main>
      <h1>rpc</h1>
      <p>registers bench-echo - POST /_rpc?id=bench-echo with a page token</p>
    </main>
  );
}
