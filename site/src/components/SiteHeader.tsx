import type { RoutePath } from '../useHashRoute';

/**
 * Site header shared by every route. The dashboard route keeps its section
 * anchors; the counterfactual route offers the way back, because a hash router
 * cannot express "route plus anchor" in one hash.
 */
export default function SiteHeader({ route }: { route: RoutePath }) {
  return (
    <header className="site-header">
      <a className="manuscript-mark" href="#top" aria-label="Interactive demo home"><span>Interactive demo</span><strong>The Oracle Is Not Enough</strong></a>
      <nav aria-label="Primary navigation">
        {route === '/' ? (
          <>
            <a href="#simulation">Walkthrough</a>
            <a href="#comparison">Two-day window</a>
            <a href="#markets">Attempt results</a>
            <a href="#method">Methods</a>
            <a href="#/counterfactual">Counterfactual</a>
          </>
        ) : (
          <>
            <a href="#/">Overview</a>
            <a href="#/counterfactual" aria-current="page">Counterfactual</a>
          </>
        )}
      </nav>
      <a className="data-link" href="./data/economic_markets.csv" download>Download data</a>
    </header>
  );
}
