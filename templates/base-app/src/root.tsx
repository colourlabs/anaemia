import { JSX } from "solid-js";

export default function RootWrapper(props: { children: JSX.Element }) {
  return <>{props.children}</>;
}
