"use client";
import { useState } from "react";
import { SyllabusUploader, UploadSuccess } from "../../../components/SyllabusUploader";
import { SyllabusReview } from "../../../components/SyllabusReview";
import { uploadSyllabus, getDbUserId } from "../../upload/actions"; // Server Action that returns { success, parseRunId, fileId, parsed, timezone }
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";

function ClientUploadPage() {
  const { user, isLoaded } = useUser();
  const [data, setData] = useState<UploadSuccess | null>(null);
  const [dbUserId, setDbUserId] = useState<string>("");
  const [loadingUserId, setLoadingUserId] = useState(true);

  // Automatically get database user ID from Clerk user ID
  useEffect(() => {
    if (isLoaded && user?.id) {
      async function fetchDbUserId() {
        try {
          setLoadingUserId(true);
          const id = await getDbUserId();
          setDbUserId(id);
        } catch (error: any) {
          console.error("Failed to get database user ID:", error);
          // Error will be handled by the UI showing the warning
        } finally {
          setLoadingUserId(false);
        }
      }
      fetchDbUserId();
    } else if (isLoaded && !user) {
      setLoadingUserId(false);
    }
  }, [isLoaded, user]);

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Syllabus Dump</h1>
        {loadingUserId && (
          <div className="text-xs text-gray-500">Loading...</div>
        )}
        {!loadingUserId && dbUserId && (
          <div className="text-xs text-gray-600">
            Ready to upload
          </div>
        )}
      </div>

      {loadingUserId && (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading user information...</div>
        </div>
      )}

      {!loadingUserId && !dbUserId && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded">
          <p className="text-sm font-semibold mb-1">Authentication Error</p>
          <p className="text-sm">
            Unable to load your user information. Please try refreshing the page or contact support if the issue persists.
          </p>
        </div>
      )}

      {!loadingUserId && dbUserId && !data && (
        <SyllabusUploader
          action={uploadSyllabus as any}
          onSuccess={(res) => setData(res)}
        />
      )}

      {!loadingUserId && dbUserId && data && (
        <SyllabusReview
          parsed={data.parsed}
          parseRunId={data.parseRunId}
          userId={dbUserId}
          timezone={data.timezone}
          onImportAnother={() => setData(null)}
        />
      )}
    </main>
  );
}

export default function UploadPage() {
  return <ClientUploadPage />;
}




