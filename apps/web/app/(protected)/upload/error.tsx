"use client";

import { useEffect } from "react";

export default function UploadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Upload page error:", error);
  }, [error]);

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-red-800 font-semibold text-lg mb-2">Something went wrong</h2>
        <p className="text-red-600 text-sm mb-4">
          {error.message || "An unexpected error occurred while loading the upload page."}
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm"
          >
            Go to Dashboard
          </a>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-4">
            <summary className="text-xs text-red-500 cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}

