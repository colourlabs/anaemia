import { useRouteData, runOnServer, type InferServerData, OverwriteHead } from "@anaemia/core";

import { WelcomeHero } from "@features/welcome-hero/components/WelcomeHero.jsx";

const fetchHomeStats = runOnServer(async () => {
  return {
    status: "online",
    clientName: "client",
    timestamp: new Date().toISOString(),
  };
});

export const loader = async () => {
  return await fetchHomeStats();
};

export default function Home() {
  const serverData = useRouteData<InferServerData<typeof fetchHomeStats>>();

  return (
    <>
      <OverwriteHead
        pageTitle="welcome to Anaemia!"
        description="this is a starter template for building your app with anaemia."
        og={{
          title: "welcome to Anaemia!",
          description: "this is a starter template for building your app with anaemia.",
        }}
      />

      <WelcomeHero data={serverData()} />
    </>
  );

  // return <WelcomeHero data={serverData()} />;
}
