// A small History-API router: the app has a handful of routes and needs no
// router dependency. Credentials never appear in any route.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type Route =
  | { name: "home" }
  | { name: "create" }
  | { name: "join"; code: string | null }
  | { name: "lobby"; code: string }
  | { name: "resume" }
  | { name: "not-found" };

const CODE = "([A-Za-z0-9]{6})";

export function matchRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "home" };
  if (path === "/create") return { name: "create" };
  if (path === "/join") return { name: "join", code: null };
  if (path === "/resume") return { name: "resume" };
  let m = new RegExp(`^/join/${CODE}$`).exec(path);
  if (m) return { name: "join", code: m[1]!.toUpperCase() };
  m = new RegExp(`^/room/${CODE}$`).exec(path);
  if (m) return { name: "lobby", code: m[1]!.toUpperCase() };
  return { name: "not-found" };
}

export const paths = {
  home: () => "/",
  create: () => "/create",
  join: (code?: string) => (code ? `/join/${code}` : "/join"),
  lobby: (code: string) => `/room/${code}`,
  resume: () => "/resume",
};

interface RouterValue {
  route: Route;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children, initialPath }: { children: ReactNode; initialPath?: string }) {
  const [pathname, setPathname] = useState(() => initialPath ?? globalThis.location?.pathname ?? "/");

  useEffect(() => {
    const onPop = () => setPathname(globalThis.location.pathname);
    globalThis.addEventListener?.("popstate", onPop);
    return () => globalThis.removeEventListener?.("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, options: { replace?: boolean } = {}) => {
    if (globalThis.history) {
      if (options.replace) globalThis.history.replaceState(null, "", to);
      else globalThis.history.pushState(null, "", to);
    }
    setPathname(to);
    globalThis.scrollTo?.({ top: 0 });
  }, []);

  const value = useMemo(() => ({ route: matchRoute(pathname), navigate }), [pathname, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter outside RouterProvider");
  return value;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}
