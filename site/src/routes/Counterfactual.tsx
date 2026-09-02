'use client';

import SiteHeader from '../components/SiteHeader';

export default function CounterfactualPage() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader route="/counterfactual" />
      <main id="main" className="cf-page">
        <span className="eyebrow">COUNTERFACTUAL SIMULATION</span>
        <h1 tabIndex={-1}>Historical stake, hypothetical open interest.</h1>
        <p className="cf-standfirst">Page under construction.</p>
      </main>
    </>
  );
}
