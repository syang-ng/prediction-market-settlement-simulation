import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/**
 * MathML Core elements for JSX. React DOM creates them in the MathML namespace,
 * but @types/react does not declare them, so the site adds the ones it uses.
 */
type MathMLProps = DetailedHTMLProps<HTMLAttributes<MathMLElement>, MathMLElement> & {
  display?: 'block' | 'inline';
  mathvariant?: 'normal' | 'italic' | 'bold' | 'bold-italic';
  stretchy?: 'true' | 'false';
  form?: 'prefix' | 'infix' | 'postfix';
  linethickness?: string;
  lspace?: string;
  rspace?: string;
  width?: string;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps;
      mi: MathMLProps;
      mn: MathMLProps;
      mo: MathMLProps;
      mrow: MathMLProps;
      msub: MathMLProps;
      msup: MathMLProps;
      msubsup: MathMLProps;
      mfrac: MathMLProps;
      msqrt: MathMLProps;
      munder: MathMLProps;
      mover: MathMLProps;
      mtext: MathMLProps;
      mspace: MathMLProps;
    }
  }
}
