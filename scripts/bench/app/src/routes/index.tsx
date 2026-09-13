const CELLS = 144;
const PROJECTS = [
  "aurora",
  "basalt",
  "cascade",
  "delta",
  "ember",
  "fjord",
  "granite",
  "harbor",
  "iris",
  "juniper",
  "kepler",
  "lumen",
];

export default function Index() {
  return (
    <main>
      <h1>anaemia benchmark</h1>
      <p>static page - served from the HTML cache after the first request</p>
      <section>
        {PROJECTS.map((project) => (
          <article key={project}>
            <h2>{project}</h2>
            <ul>
              {Array.from({ length: CELLS }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                  {project}-{n}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
