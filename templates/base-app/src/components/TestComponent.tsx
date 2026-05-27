import { createSignal } from "solid-js";

export default function TestComponent() {
  const [count, setCount] = createSignal(0);

  return <button onClick={() => setCount(count() + 1)}>pressed: {count()}</button>;
}
