"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <main className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-red-800 font-semibold text-lg mb-2">Dashboard Error</h2>
        <p className="text-red-600 text-sm mb-4">
          {error.message || "An unexpected error occurred while loading the dashboard."}
        </p>
        <div className="flex gap-3 mb-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Try again
          </button>
        </div>
        <div className="text-xs text-red-500 mb-2">
          Common issues:
        </div>
        <ul className="text-xs text-red-600 list-disc list-inside space-y-1 mb-4">
          <li>Make sure the API server is running on port 8787</li>
          <li>Check that your user ID is mapped in the database</li>
          <li>Verify environment variables are set correctly</li>
        </ul>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-4">
            <summary className="text-xs text-red-500 cursor-pointer">Error details</summary>
            <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto max-h-64">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}




