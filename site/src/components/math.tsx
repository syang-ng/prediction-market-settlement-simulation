import type { ReactNode } from 'react';

/**
 * Native MathML wrappers. Formulas are typeset by the browser (real
 * subscripts, radicals, italic variables) in the self-hosted math font; no
 * library is involved. Compose MathML children directly:
 *
 *   <Formula><msub><mi>r</mi><mtext>USD</mtext></msub><mo>=</mo><mi>OI</mi><mo>/</mo><mi>α</mi></Formula>
 */
export function Formula({ children, block = false, label }: { children: ReactNode; block?: boolean; label?: string }) {
  return (
    <math display={block ? 'block' : undefined} aria-label={label}>
      {children}
    </math>
  );
}

/** A lone identifier such as ρ or α, set as a math variable. */
export function Sym({ children }: { children: string }) {
  return (
    <math>
      <mi>{children}</mi>
    </math>
  );
}

/** "ρ = 0.80" as one expression. */
export function Assign({ sym, value }: { sym: string; value: string | number }) {
  return (
    <math>
      <mi>{sym}</mi>
      <mo>=</mo>
      <mn>{String(value)}</mn>
    </math>
  );
}
