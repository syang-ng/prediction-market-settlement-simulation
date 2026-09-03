'use client';

import SiteHeader from '../components/SiteHeader';
import { Assign, Formula, Sym } from '../components/math';
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
      <div className="construction-grid" aria-label="Reward constructions">
        <article>
          <span className="construction-tag is-used">Used for every result on this site</span>
          <h3>Single-market greedy construction</h3>
          <p>Paper §5.4, Algorithm 1. Each attempt is its own batch. Voters are ordered by break-even rate <Formula><msub><mi>η</mi><mi>i</mi></msub><mo>=</mo><msub><mi>c</mi><mi>i</mi></msub><mo>/</mo><msub><mi>σ</mi><mi>i</mi></msub></Formula> and scanned once: a voter enters with its full stake when its share of the pool covers its cost, and is otherwise skipped while the scan continues. The result is a pure-strategy equilibrium that passes admission once the committed stake <Formula><msup><mi>W</mi><mi>G</mi></msup></Formula> reaches <Sym>r</Sym>. Since <Formula><msup><mi>W</mi><mi>G</mi></msup></Formula> is nondecreasing in <Sym>R</Sym>, a binary search on the one-cent grid returns the smallest pool the scan certifies: a sufficient reward, not a global optimum. Both capacity runs and the Counterfactual tab use it.</p>
          <div className="method-formula"><Formula block><mtext>enter</mtext><mspace width="0.35em" /><mi>i</mi><mspace width="0.35em" /><mtext>if</mtext><mspace width="0.4em" /><mfrac><mrow><mi>R</mi><mspace width="0.1em" /><msub><mi>σ</mi><mi>i</mi></msub></mrow><mrow><msup><mi>W</mi><mi>G</mi></msup><mo>+</mo><msub><mi>σ</mi><mi>i</mi></msub></mrow></mfrac><mo>≥</mo><msub><mi>c</mi><mi>i</mi></msub></Formula></div>
        </article>
        <article>
          <span className="construction-tag">Paper robustness check · not used on this site</span>
          <h3>Multi-market protected construction</h3>
          <p>Paper §5.5 and Appendix E. Attempts resolved in one DVM round form a batch <Sym>S</Sym>. Voters holding at least <Sym>θ</Sym> in stake are protected, and <Sym>θ</Sym> is lowered until their stake covers the batch requirement <Formula><mi>L</mi><mo>(</mo><mi>S</mi><mo>)</mo><mo>=</mo><mo>∑</mo><msub><mi>r</mi><mi>j</mi></msub></Formula>. Each protected voter commits its full stake to every market in the batch, and each pool pays the worst protected cost-to-stake ratio under maximum dilution, so the batch stays live whatever the other voters do. This commits more stake and pays more than the greedy scan, but certifies the whole round at once. It is implemented in <code>experiments/robust_protected_layer_simulation.py</code>; its results are not shown on this site.</p>
          <div className="method-formula"><Formula block><msubsup><mi>R</mi><mi>j</mi><mtext>robust</mtext></msubsup><mo>=</mo><msub><mi>B</mi><mtext>total</mtext></msub><mo>·</mo><munder><mi>max</mi><mrow><mi>i</mi><mo>∈</mo><msub><mi>H</mi><mi>θ</mi></msub></mrow></munder><mspace width="0.15em" /><mfrac><msub><mi>c</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><msub><mi>σ</mi><mi>i</mi></msub></mfrac></Formula></div>
        </article>
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
