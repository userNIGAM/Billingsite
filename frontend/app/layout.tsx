import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '../providers/Providers';

export const metadata: Metadata = {
  title: 'Khaja Ghar | Canteen Management',
  description: 'Khaja Ghar canteen operations and account management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
