'use client';

import SiteHeader from '../components/SiteHeader';
import { Assign, Formula } from '../components/math';
import type { DashboardData } from '../types';
import { useDashboardData } from '../useDashboardData';

function Methods({ data }: { data: DashboardData }) {
  return (
    <section className="methods-section" id="method">
      <div className="section-intro">
        <div><span className="eyebrow">METHOD & DATA</span><h1 tabIndex={-1}>Observed exposure and stake; simulated verification costs.</h1></div>
        <p>The estimand is a sufficient reward conditional on an observed dispute—not a dispute probability or oracle-error rate.</p>
      </div>
      <div className="method-grid">
        <article><span className="method-number">01</span><h3>Define attempts</h3><p>Ordinary binaries remain request singletons. NegRisk requests sharing an event and DVM round become one economic attempt, one verification task, and one reward pool.</p><div className="method-formula"><Formula block><mi>u</mi><mo>=</mo><mtext>request</mtext><mspace width="0.35em" /><mtext>or</mtext><mspace width="0.35em" /><mo>(</mo><mtext>event</mtext><mo>,</mo><mtext>round</mtext><mo>)</mo></Formula></div></article>
        <article><span className="method-number">02</span><h3>Correct exposure</h3><p>For NegRisk, every active component condition is summed once at the anchor block. Signed balances are retained; the original condition OI remains an audit field.</p><div className="method-formula"><Formula block><msub><mi>OI</mi><mi>u</mi></msub><mo>=</mo><munder><mo>∑</mo><mi>k</mi></munder><msub><mi>OI</mi><mi>k</mi></msub><mo>(</mo><msub><mtext>block</mtext><mi>u</mi></msub><mo>−</mo><mn>1</mn><mo>)</mo></Formula></div></article>
        <article><span className="method-number">03</span><h3>Draw costs</h3><p>Low, baseline, and high have means $0.20, $1, and $4. Each uses the same right-skewed Beta(2, 8) shape, support <Formula><mo>[</mo><mn>0.25</mn><mi>μ</mi><mo>,</mo><mn>4</mn><mi>μ</mi><mo>]</mo></Formula>, and within-unit correlation <Assign sym="ρ" value={data.meta.costCorrelation} />.</p><div className="method-formula"><Formula block><msub><mi>c</mi><mrow><mi>i</mi><mi>u</mi></mrow></msub><mo>=</mo><msub><mi>μ</mi><mi>s</mi></msub><mo>(</mo><mn>0.25</mn><mo>+</mo><mn>3.75</mn><msub><mi>X</mi><mrow><mi>i</mi><mi>u</mi></mrow></msub><mo>)</mo></Formula></div></article>
        <article><span className="method-number">04</span><h3>Find reward</h3><p>All observed positive-stake revealers are candidates. For each realized cost vector, the paper’s greedy sufficient construction is combined with binary search on a one-cent reward grid.</p><div className="method-formula"><Formula block><mi>min</mi><mspace width="0.2em" /><mi>R</mi><mo>:</mo><msubsup><mi>W</mi><mi>u</mi><mi>G</mi></msubsup><mo>(</mo><mi>R</mi><mo>)</mo><mo>≥</mo><msub><mi>r</mi><mi>u</mi></msub></Formula></div></article>
      </div>
      <div className="truth-callout"><strong>Two capacity runs</strong><p>Full release treats every attempt independently. The rolling run locks admitted pro-rata security load from arrival until DVM resolution plus {data.meta.reviewWindowDays} days; failed arrivals are recorded once and not retried.</p></div>
      <div className="source-coverage" aria-label="Oracle deployment coverage">
        <div><strong>Three-deployment census</strong><p>All source-labelled disputes before the cutoff are retained in the frozen inventory. Simulation uses only exact complete-case linkages.</p></div>
        {data.meta.oracleSources.map((source) => (
          <div key={source.variant}><span>{source.label}</span><strong>{source.rawCount.toLocaleString()} → {source.eligibleCount.toLocaleString()} → {source.attemptCount.toLocaleString()}</strong><small>raw · eligible · attempts</small></div>
        ))}
      </div>
      <div className="legacy-note"><strong>Legacy OOv1 audit.</strong> Twenty-two settled requests lack an exact current CLOB linkage and one request remains unresolved. They stay in the census inventory, but none enters the simulation; no fuzzy match or zero imputation is used.</div>
      <div className="method-bottom">
        <div><h3>Source linkage</h3><ul><li><a href="https://github.com/UMAprotocol/subgraphs">UMA official subgraphs ↗</a></li><li><a href="https://github.com/Polymarket/polymarket-subgraph">Polymarket public subgraphs ↗</a></li><li><a href="https://github.com/Polymarket/neg-risk-ctf-adapter">Polymarket NegRisk adapter ↗</a></li><li><a href="https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles">Coinbase candles ↗</a></li></ul></div>
      </div>
    </section>
  );
}

/** The Method tab: the method-and-data section on its own page, sharing the dashboard's data load. */
export default function MethodPage() {
  const { data, error } = useDashboardData();
  if (error) return <main className="load-state"><strong>Unable to load the panel.</strong><span>{error}</span></main>;
  if (!data) return <main className="load-state"><span className="loading-orb" /><strong>Loading method and data…</strong></main>;
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <SiteHeader route="/method" />
      <main id="main"><Methods data={data} /></main>
    </>
  );
}
