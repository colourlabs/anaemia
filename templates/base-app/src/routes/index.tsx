import { 
  useRouteData, 
  runOnServer, 
  type InferServerData 
} from "@anaemia/core";

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

  return <WelcomeHero data={serverData()} />;
}