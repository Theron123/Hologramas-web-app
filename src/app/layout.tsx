import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloForge — AI-Powered Holographic Ad Campaigns',
  description: 'Transform your product photos into stunning holographic 3D advertising campaigns powered by artificial intelligence. Generate professional ad copy, 3D renders, and holographic visuals in seconds.',
  keywords: ['hologram', '3D advertising', 'AI campaign', 'holographic render', 'product visualization'],
  authors: [{ name: 'HoloForge' }],
  openGraph: {
    title: 'HoloForge — AI-Powered Holographic Ad Campaigns',
    description: 'Transform product photos into stunning holographic 3D advertising campaigns.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
