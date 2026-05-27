import { ParentProps } from "solid-js";

export default function RootLayout(props: ParentProps) {
  return (
    <>
      <nav>anaemia</nav>
      {props.children}
    </>
  );
}