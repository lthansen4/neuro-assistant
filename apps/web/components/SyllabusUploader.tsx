"use client";
import { useCallback, useRef, useState, useEffect } from "react";

type ParsedSyllabus = {
  confidence: number;
  course: {
    name: string;
    professor?: string | null;
    credits?: number | null;
    schedule?: { day: string; start: string; end: string; location?: string | null }[] | null;
    office_hours?: { day: string; start: string; end: string; location?: string | null }[] | null;
    grade_weights?: Record<string, number> | null;
  };
  assignments: {
    title: string;
    due_date?: string | null;
    category?: string | null;
    effort_estimate_minutes?: number | null;
  }[];
};

export type UploadSuccess = {
  parseRunId: string;
  fileId: string;
  parsed: ParsedSyllabus;
  timezone: string;
};

export function SyllabusUploader({
  onSuccess,
  action,
}: {
  onSuccess: (data: UploadSuccess) => void;
  // Server Action imported from app/(protected)/upload/actions (must accept FormData, return { success/ok, parseRunId, fileId, parsed, timezone })
  action: (data: FormData) => Promise<any>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [timezone, setTimezone] = useState("UTC");

  // detect timezone on mount
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setTimezone(tz);
    } catch {
      setTimezone("UTC");
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files[0]) return;
      const file = files[0];
      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("timezone", timezone);
        const res = await action(fd);
        
        // Check for error response
        if (res?.error || (!res?.success && !res?.ok)) {
          throw new Error(res?.error || "Upload/parse failed");
        }
        
        // Validate required fields
        if (!res?.parsed || !res?.parseRunId) {
          throw new Error(
            res?.error || 
            "Server did not return parsed data. The parsing may have failed or no course data was extracted."
          );
        }
        
        // Success - call onSuccess callback
        onSuccess({
          parseRunId: res.parseRunId,
          fileId: res.fileId || "",
          parsed: res.parsed,
          timezone: res.timezone || timezone,
        });
      } catch (e: any) {
        console.error("Upload error:", e);
        setError(e.message || "Upload failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [action, onSuccess, timezone]
  );

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    await handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300"
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-lg font-medium">Drop syllabus PDF here</div>
        <div className="text-sm text-gray-600 mt-1">or click to browse</div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {loading && (
          <div className="mt-4">
            <div className="text-sm text-gray-700 mb-1">Sending to AI...</div>
            <div className="w-full bg-gray-200 h-2 rounded">
              <div className="h-2 bg-blue-500 rounded animate-pulse" style={{ width: "75%" }} />
            </div>
          </div>
        )}
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {!loading && !error && (
        <div className="text-xs text-gray-500">Timezone: {timezone}. You can override during review if needed.</div>
      )}
    </div>
  );
}



