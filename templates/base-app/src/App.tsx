import { createSignal, onMount } from "solid-js";
import { runOnServer } from "@anaemia/core";

import styles from "./App.module.scss";

const getServerStatus = runOnServer(async (clientName: string) => {
  console.log(`[hono rpc bridge]: invoked securely by ${clientName}`);
  return {
    status: "ONLINE",
    engine: "hono + rspack",
    timestamp: new Date().toLocaleTimeString(),
    secretEnvKey: process.env.NODE_ENV || "development",
  };
});

export default function App() {
  const [count, setCount] = createSignal(0);
  const [serverData, setServerData] = createSignal<any>(null);

  onMount(async () => {
    try {
      const data = await getServerStatus("andromeda Engine");
      setServerData(data);
    } catch (err) {
      console.error("RPC fetch Failure:", err);
    }
  });

  return (
    <div class={styles.wrapper}>
      <h1>anaemia framework</h1>

      <button onClick={() => setCount(count() + 1)}>Clicks: {count()}</button>

      <section>
        <h3>RPC node network stream</h3>
        <p>
          data below is pulled seamlessly via the <code>runOnServer</code> compiler transformation:
        </p>
        <pre>{serverData() ? JSON.stringify(serverData(), null, 2) : "connecting to Hono backend stream..."}</pre>
      </section>
    </div>
  );
}
