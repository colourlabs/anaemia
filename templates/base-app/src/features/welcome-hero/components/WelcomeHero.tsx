import styles from "./WelcomeHero.module.scss";

interface WelcomeHeroProps {
  data?: {
    status: string;
    clientName: string;
    timestamp: string;
  };
}

export function WelcomeHero(props: WelcomeHeroProps) {  
  return (
    <div class={styles.wrapper}>
      <h1 class={styles.title}>anaemia</h1>
      <p class={styles.subtitle}>
       a high-performance, opinionated SolidJS SSR framework that allows you to ship huge projects fast and maintain them!
      </p>

      <div class={styles.card}>
        <div class={styles.cardHeader}>
          <span class={styles.dot} /> 
          <span class={styles.cardTitle}>Hydrated Server State</span>
        </div>
        <pre class={styles.codeBlock}>
          {props.data 
            ? JSON.stringify(props.data, null, 2) 
            : "loading server metrics..."
          }
        </pre>
      </div>

      <div class={styles.footer}>
        edit <code class={styles.inlineCode}>src/features/welcome-hero/components/WelcomeHero.tsx</code> to begin.
      </div>
    </div>
  );
}