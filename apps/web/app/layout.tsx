import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import Script from 'next/script';
import React from 'react';
import { Inter, Instrument_Serif } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-serif',
});

function ClerkErrorBoundary({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  if (!publishableKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-red-800 font-semibold text-xl mb-2">Configuration Error</h2>
          <p className="text-gray-600 text-sm">
            Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable. 
            Please check your .env.local file.
          </p>
        </div>
      </div>
    );
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}

export const metadata = {
  title: 'Gesso | Your Academic Canvas',
  description: 'A neuro-adaptive executive function assistant for the modern student.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${instrumentSerif.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body suppressHydrationWarning className="font-sans text-brand-blue selection:bg-brand-green/10 selection:text-brand-green relative min-h-screen bg-brand-gesso">
        {/* Global Mesh Gradient Background */}
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,_rgba(255,255,255,0.8)_0%,_rgba(243,232,255,0.2)_30%,_rgba(209,250,229,0.1)_70%,_transparent_100%)]" />
        
        {/* Gesso Texture Overlay */}
        <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />
        
        {/* OneSignal SDK */}
        <Script 
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" 
          defer
          strategy="afterInteractive"
        />
        <ClerkErrorBoundary>
          {children}
        </ClerkErrorBoundary>
      </body>
    </html>
  );
}
