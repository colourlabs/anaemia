import { createContext, useContext, createResource, createComponent, type JSX } from "solid-js";
import { isServer } from "solid-js/web";
import { useParams, useLocation, type Params } from "@solidjs/router";
import type { Location } from "@solidjs/router";
import { ssrStorage } from "./context.js";
import { createRouteRequest } from "./route-request.js";
import { ANAEMIA_DATA_SCRIPT_ID, LOADER_DATA_KEY } from "./constants.js";

type LoaderArgs<TParams extends Params> = {
  params: TParams;
  location: Location;
  request: Request;
};

type RouteDataControllerProps<TParams extends Params = Params> = {
  loader: (args: LoaderArgs<TParams>) => unknown | Promise<unknown>;
  children: JSX.Element;
};

type RouteDataContextValue<T = unknown> = {
  data: () => T;
};

const RouteDataContext = createContext<RouteDataContextValue>();

let hasReadClientHydrationData = false;

interface AnaemiaHydrationData {
  [LOADER_DATA_KEY]?: unknown;
}

function readSSRData(): unknown {
  if (isServer) {
    return ssrStorage.getStore()?.get(LOADER_DATA_KEY);
  }
  if (hasReadClientHydrationData) return undefined;
  hasReadClientHydrationData = true;
  const el = document.getElementById(ANAEMIA_DATA_SCRIPT_ID);
  if (!el?.textContent) return undefined;
  try {
    return (JSON.parse(el.textContent) as AnaemiaHydrationData)[LOADER_DATA_KEY];
  } catch {
    return undefined;
  }
}

export function RouteDataController<TParams extends Params = Params>(props: RouteDataControllerProps<TParams>) {
  const params = useParams<TParams>();
  const location = useLocation();
  const ssrData = readSSRData();

  const [resource] = createResource(
    () => location.pathname,
    () => {
      if (isServer && ssrData !== undefined) return ssrData;
      return props.loader({
        params,
        location,
        request: createRouteRequest(location.pathname),
      });
    },
    {
      initialValue: ssrData,
      ssrLoadFrom: "initial",
    },
  );

  return createComponent(RouteDataContext.Provider, {
    value: { data: resource },
    get children() {
      return props.children;
    },
  });
}

export function useRouteData<T = unknown>(): () => T {
  const ctx = useContext(RouteDataContext);
  if (!ctx) {
    throw new Error("useRouteData must be used inside RouteDataController");
  }
  return ctx.data as () => T;
}
