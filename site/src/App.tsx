'use client';

import { useEffect, useRef } from 'react';
import Dashboard from './Dashboard';
import CounterfactualPage from './routes/Counterfactual';
import { useHashRoute, type RoutePath } from './useHashRoute';

const titles: Record<RoutePath, string> = {
  '/': 'Interactive Demo · Sufficient Dispute Rewards',
  '/counterfactual': 'Counterfactual Open Interest · Sufficient Dispute Rewards',
};

export default function App() {
  const route = useHashRoute();
  const path = route?.path ?? null;
  const previousPath = useRef<RoutePath | null>(null);

  // On a route change (not on anchor-only hash changes): instant scroll to top,
  // then move focus to the new view's <h1> so assistive tech hears the change.
  useEffect(() => {
    if (!path) return;
    document.title = titles[path];
    const changed = previousPath.current !== null && previousPath.current !== path;
    previousPath.current = path;
    if (!changed) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [path]);

  if (!route) return <main className="load-state" aria-busy="true" />;
  if (route.path === '/counterfactual') return <CounterfactualPage params={route.params} setParams={route.setParams} />;
  return <Dashboard />;
}
