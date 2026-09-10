import React from 'react';
import './globals.css';
import ClientLayout from '../components/client-layout';

export const metadata = {
  title: 'ALON POS SYSTEM',
  description: 'Point of Sales + Inventory Management',
  icons: {
    icon: [
      { url: '/alon-mark.png' }
    ],
    apple: '/alon-mark.png',
  },
};

// import { Inter } from 'next/font/google';
// const inter = Inter({ subsets: ['latin'] });
const inter = { className: 'font-sans' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
