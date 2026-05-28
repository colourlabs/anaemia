import { type JSX } from "solid-js";
import { type Params } from "@solidjs/router";
import type { Location } from "@solidjs/router";
type RouteDataControllerProps<TParams extends Params = Params> = {
    loader: (args: {
        params: TParams;
        location: Location;
        request: Request;
    }) => any | Promise<any>;
    children: JSX.Element;
};
export declare function RouteDataController<TParams extends Params = Params>(props: RouteDataControllerProps<TParams>): JSX.Element;
export declare function useRouteData<T = any>(): () => T;
export {};
//# sourceMappingURL=route-data.d.ts.map