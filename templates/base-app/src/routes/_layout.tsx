import "@routes/global.scss";
import { ParentProps } from "solid-js";

export { config } from "./_layout.config.js";

export default function RootLayout(props: ParentProps) {
  return <>{props.children}</>;
}
