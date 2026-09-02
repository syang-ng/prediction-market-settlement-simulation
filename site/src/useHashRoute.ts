import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

export type RoutePath = '/' | '/counterfactual';

export interface HashRoute {
  path: RoutePath;
  params: URLSearchParams;
}

export interface HashRouteState extends HashRoute {
  /** Rewrite the current route's query without adding a history entry. */
  setParams: (params: URLSearchParams) => void;
}

const LEGACY_DASHBOARD_KEYS = ['attempt', 'request', 'market', 'scenario'] as const;

/** A hash that does not start with "#/" is a page anchor on the default route. */
export function parseHash(hash: string): HashRoute {
  if (!hash.startsWith('#/')) return { path: '/', params: new URLSearchParams() };
  const body = hash.slice(2);
  const queryStart = body.indexOf('?');
  const rawPath = (queryStart === -1 ? body : body.slice(0, queryStart)).replace(/\/+$/, '');
  const params = new URLSearchParams(queryStart === -1 ? '' : body.slice(queryStart + 1));
  return { path: rawPath === 'counterfactual' ? '/counterfactual' : '/', params };
}

export function formatHash(path: RoutePath, params: URLSearchParams): string {
  const query = params.toString();
  return `#${path}${query ? `?${query}` : ''}`;
}

// history.replaceState does not fire hashchange, so writers notify subscribers.
const listeners = new Set<() => void>();

function notifyHashListeners(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('hashchange', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('hashchange', listener);
  };
}

function getSnapshot(): string {
  return window.location.hash;
}

function getServerSnapshot(): null {
  return null;
}

/**
 * The current hash route, or null on the server and during hydration so both
 * renders agree. Dashboard state lives in the real query string
 * (?attempt=&scenario=); a link such as "#/?attempt=<id>" is rewritten to
 * "?attempt=<id>#/" before the dashboard reads location.search.
 */
export function useHashRoute(): HashRouteState | null {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const route = useMemo(() => (hash === null ? null : parseHash(hash)), [hash]);

  useEffect(() => {
    if (!route || route.path !== '/' || !LEGACY_DASHBOARD_KEYS.some((key) => route.params.has(key))) return;
    const search = new URLSearchParams(window.location.search);
    for (const key of LEGACY_DASHBOARD_KEYS) {
      const value = route.params.get(key);
      if (value !== null) search.set(key, value);
    }
    const query = search.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}#/`);
    notifyHashListeners();
  }, [route]);

  const setParams = useCallback((params: URLSearchParams) => {
    const nextHash = formatHash(parseHash(window.location.hash).path, params);
    if (window.location.hash === nextHash) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`);
    notifyHashListeners();
  }, []);

  return useMemo(() => (route ? { path: route.path, params: route.params, setParams } : null), [route, setParams]);
}
