import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * Type system (docs/DESIGN-DIRECTION.md §3).
 *
 * Two faces, chosen rather than inherited. The scaffold shipped with Geist, which is
 * Vercel's default and reads as "generated" — §12 names exactly that class of safe default
 * as the look to avoid.
 *
 *   Archivo        a grotesque with real width and weight, built for high-impact display
 *                  that still sets well at text sizes. Carries names and headlines.
 *   IBM Plex Mono  the data face. Every measurement — wait band, timestamp, distance,
 *                  provenance line — is set in it, with tabular figures so columns of
 *                  numbers actually line up.
 *
 * That split is the identity: **anything measured is mono, anything claimed is sans.**
 * A reader can tell at a glance which parts of the screen are measurements and which are
 * assertions, which is the product's whole argument expressed typographically.
 *
 * Both are self-hosted by next/font — no CDN request, no silent fallback, no layout shift.
 */

const archivo = Archivo({
  variable: '--font-sans',
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nomad — veterinary ER wait times',
  description:
    'Find where your pet will be seen fastest. Typical wait estimates for veterinary emergency rooms, with honest uncertainty.',
};

/**
 * `viewportFit: cover` plus the safe-area padding in globals.css keeps the critical-signs
 * banner and the call button clear of the notch and the home indicator. The person reading
 * this is one-handed in a car park; a button under the home bar is a button they miss.
 */
export const viewport: Viewport = {
  themeColor: '#0A0F16',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
