import { type JSX } from "solid-js";
import { type Params } from "@solidjs/router";
import type { Location } from "@solidjs/router";
type LoaderArgs<TParams extends Params> = {
    params: TParams;
    location: Location;
    request: Request;
};
type RouteDataControllerProps<TParams extends Params = Params> = {
    loader: (args: LoaderArgs<TParams>) => unknown | Promise<unknown>;
    children: JSX.Element;
};
export declare function RouteDataController<TParams extends Params = Params>(props: RouteDataControllerProps<TParams>): JSX.Element;
export declare function useRouteData<T = unknown>(): () => T;
export {};
//# sourceMappingURL=route-data.d.ts.map