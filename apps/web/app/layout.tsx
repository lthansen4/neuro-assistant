import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import Script from 'next/script';
import React from 'react';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body suppressHydrationWarning>
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
