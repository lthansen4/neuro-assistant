"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { fetchStagedItems, commitStagedItems } from "../../../lib/api";

interface StagedItem {
  id: string;
  type: string;
  payload: any;
  confidence: number | null;
  createdAt: Date;
}

interface StagedItems {
  course: StagedItem[];
  assignments: StagedItem[];
  office_hours: StagedItem[];
  class_schedule: StagedItem[];
  grade_weights: StagedItem[];
}

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const parseRunId = searchParams.get("parseRunId");
  
  const [data, setData] = useState<{
    parseRun: any;
    items: StagedItems;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);

  useEffect(() => {
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }

    if (!parseRunId) {
      setError("No parse run ID provided");
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchStagedItems(parseRunId, user.id);
        if (result.success) {
          setData(result);
        } else {
          setError(result.error || "Failed to load staged items");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load staged items");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [parseRunId, user, isLoaded]);

  useEffect(() => {
    if (commitResult?.success) {
      // Redirect to course page or dashboard after successful commit
      setTimeout(() => {
        if (commitResult.courseId) {
          router.push(`/dashboard?course=${commitResult.courseId}`);
        } else {
          router.push("/dashboard");
        }
      }, 2000);
    }
  }, [commitResult, router]);

  async function handleCommit() {
    if (!parseRunId || !user) return;
    
    try {
      setCommitting(true);
      setError(null);
      const result = await commitStagedItems(parseRunId, user.id);
      setCommitResult(result);
    } catch (err: any) {
      setError(err.message || "Failed to commit items");
      setCommitResult(null);
    } finally {
      setCommitting(false);
    }
  }

  if (loading) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading staged items...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error || "Failed to load staged items"}
        </div>
      </main>
    );
  }

  const { parseRun, items } = data;
  const totalItems =
    items.course.length +
    items.assignments.length +
    items.office_hours.length +
    items.class_schedule.length +
    items.grade_weights.length;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Review Staged Items</h1>
        <p className="text-sm text-gray-600">
          Review and commit the parsed syllabus items
        </p>
        <div className="mt-2 text-xs text-gray-500">
          File: {parseRun.file.originalFilename} | Confidence:{" "}
          {parseRun.confidence ? `${(Number(parseRun.confidence) * 100).toFixed(1)}%` : "N/A"}
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}

      {commitResult?.success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <strong>Success!</strong> {commitResult.message}
          {commitResult.summary && (
            <div className="mt-2 text-sm">
              <div>Course: {commitResult.summary.course || 0}</div>
              <div>Assignments: {commitResult.summary.assignments || 0}</div>
              <div>Schedule Events: {commitResult.summary.scheduleEvents || 0}</div>
              <div>Office Hours: {commitResult.summary.officeHours || 0}</div>
            </div>
          )}
          <p className="mt-2 text-sm">Redirecting to dashboard...</p>
        </div>
      )}

      {/* Course */}
      {items.course.length > 0 && (
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Course</h2>
          {items.course.map((item) => (
            <div key={item.id} className="bg-gray-50 p-3 rounded">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <strong>Name:</strong> {item.payload.name}
                </div>
                {item.payload.professor && (
                  <div>
                    <strong>Professor:</strong> {item.payload.professor}
                  </div>
                )}
                {item.payload.credits && (
                  <div>
                    <strong>Credits:</strong> {item.payload.credits}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Assignments */}
      {items.assignments.length > 0 && (
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">
            Assignments ({items.assignments.length})
          </h2>
          <div className="space-y-2">
            {items.assignments.map((item) => (
              <div key={item.id} className="bg-gray-50 p-3 rounded text-sm">
                <div className="font-medium">{item.payload.title}</div>
                {item.payload.due_date && (
                  <div className="text-gray-600">
                    Due: {new Date(item.payload.due_date).toLocaleDateString()}
                  </div>
                )}
                {item.payload.category && (
                  <div className="text-gray-600">Category: {item.payload.category}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Class Schedule */}
      {items.class_schedule.length > 0 && (
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">
            Class Schedule ({items.class_schedule.length})
          </h2>
          <div className="space-y-2">
            {items.class_schedule.map((item) => (
              <div key={item.id} className="bg-gray-50 p-3 rounded text-sm">
                <div>
                  <strong>{item.payload.day}</strong>: {item.payload.start} - {item.payload.end}
                </div>
                {item.payload.location && (
                  <div className="text-gray-600">Location: {item.payload.location}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Office Hours */}
      {items.office_hours.length > 0 && (
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">
            Office Hours ({items.office_hours.length})
          </h2>
          <div className="space-y-2">
            {items.office_hours.map((item) => (
              <div key={item.id} className="bg-gray-50 p-3 rounded text-sm">
                <div>
                  <strong>{item.payload.day}</strong>: {item.payload.start} - {item.payload.end}
                </div>
                {item.payload.location && (
                  <div className="text-gray-600">Location: {item.payload.location}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grade Weights */}
      {items.grade_weights.length > 0 && (
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Grade Weights</h2>
          {items.grade_weights.map((item) => (
            <div key={item.id} className="bg-gray-50 p-3 rounded">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(item.payload as Record<string, number>).map(([key, value]) => (
                  <div key={key}>
                    <strong>{key}:</strong> {value}%
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Commit Button */}
      {totalItems > 0 && !commitResult?.success && (
        <div className="border-t pt-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total items to commit: <strong>{totalItems}</strong>
            </div>
            <button
              onClick={handleCommit}
              disabled={committing || !user}
              className={`px-6 py-3 rounded text-white font-semibold transition-colors ${
                committing || !user
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {committing ? "Committing..." : "Commit All Items"}
            </button>
          </div>
        </div>
      )}

      {totalItems === 0 && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          No staged items found for this parse run.
        </div>
      )}
    </main>
  );
}

