import { createResource } from "solid-js";
import { runOnServer } from "@anaemia/core";

import styles from "./index.module.scss";
import TestComponent from "~/components/TestComponent";
import { A } from "@solidjs/router";

const getServerStatus = runOnServer(async (clientName: string) => {
  return {
    status: "online",
    clientName,
    timestamp: new Date().toLocaleTimeString(),
  };
});

export default function Home() {
  const [serverData] = createResource(() => getServerStatus("client"));

  return (
    <div class={styles.wrapper}>
      <h1>anaemia framework</h1>
      <pre>{serverData() ? JSON.stringify(serverData(), null, 2) : "loading..."}</pre>
      <TestComponent />

      <A href="/example-page">wow</A>
    </div>
  );
}