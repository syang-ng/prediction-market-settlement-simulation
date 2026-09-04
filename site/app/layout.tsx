import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Oracle Is Not Enough - Secure Settlement Dashboard',
  description: 'Corrected economic-unit simulation of sufficient rewards for disputed prediction markets through May 31, 2026.',
  openGraph: {
    title: 'The Oracle Is Not Enough - Secure Settlement Dashboard',
    description: 'Explore the practical cost of secure prediction-market settlement using historical UMA stake and Polymarket dispute data.',
    type: 'website',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Oracle Is Not Enough - Secure Settlement Dashboard',
    description: 'Explore the practical cost of secure prediction-market settlement using historical UMA stake and Polymarket dispute data.',
    images: ['/og.png'],
  },
  icons: { icon: '/og.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
