import { createContext, useContext, type Accessor, createResource, createComponent, Resource } from "solid-js";
import { ssrStorage } from "./context.js";
import { isServer } from "solid-js/web";

const RouteDataContext = createContext<Resource<any>>();

let clientHydrationData: any = undefined;
let isFirstHydrationPass = true;

function getHydrationData() {
  if (isServer) return undefined;
  if (!isFirstHydrationPass) return undefined;

  const script = document.getElementById("__ANAEMIA_DATA__");
  if (script) {
    try {
      const parsed = JSON.parse(script.textContent || "{}");
      clientHydrationData = parsed.__LOADER_DATA__;
    } catch (e) {
      console.error("[anaemia] failed parsing hydration data tag:", e);
    }
  }
  isFirstHydrationPass = false;
  return clientHydrationData;
}

export function RouteDataController(props: { loader: any; children: any }) {
  let initialValue: any = undefined;

  if (isServer) {
    const store = ssrStorage.getStore();
    initialValue = store?.get("__LOADER_DATA__");
  } else {
    initialValue = getHydrationData();
  }

  const [data] = createResource(
    () => props.loader,
    async (currentLoader) => {
      if (initialValue !== undefined) {
        const cachedValue = initialValue;
        initialValue = undefined;
        return cachedValue;
      }
      if (typeof currentLoader === "function") {
        return await currentLoader();
      }
      return null;
    }
  );

  return createComponent(RouteDataContext.Provider, {
    get value() {
      return data;
    },
    get children() {
      return props.children;
    },
  });
}

export function useRouteData<T = any>(): Accessor<T | undefined> {
  const context = useContext(RouteDataContext);
  if (!context) {
    throw new Error("[anaemia] useRouteData must be consumed inside an Anaemia Route scope layout context.");
  }
  return context;
}
