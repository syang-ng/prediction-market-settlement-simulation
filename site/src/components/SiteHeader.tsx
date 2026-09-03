import type { RoutePath } from '../useHashRoute';

const tabs: { path: RoutePath; label: string }[] = [
  { path: '/', label: 'Overview' },
  { path: '/counterfactual', label: 'Counterfactual' },
  { path: '/method', label: 'Method' },
];

/** Site header shared by every route: the wordmark plus the three top-level tabs. */
export default function SiteHeader({ route }: { route: RoutePath }) {
  return (
    <header className="site-header">
      <a className="manuscript-mark" href="#top" aria-label="Home"><strong>The Oracle Is Not Enough</strong></a>
      <nav aria-label="Primary navigation">
        {tabs.map((tab) => (
          <a key={tab.path} href={`#${tab.path}`} aria-current={tab.path === route ? 'page' : undefined}>{tab.label}</a>
        ))}
      </nav>
    </header>
  );
}
