import { runOnServer, useRouteData, type InferServerData } from "@anaemia/core";

const ROWS = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1,
  name: `dyn-record-${i + 1}`,
  status: i % 3 === 0 ? "active" : i % 3 === 1 ? "pending" : "done",
}));

const fetchRows = runOnServer(async () => ROWS);

export const loader = async () => await fetchRows();

export default function Dynamic() {
  const rows = useRouteData<InferServerData<typeof fetchRows>>();
  return (
    <main>
      <h1>dynamic</h1>
      <p>loader route - rerendered and never cached</p>
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>name</th>
            <th>status</th>
          </tr>
        </thead>
        <tbody>
          {rows().map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.name}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
