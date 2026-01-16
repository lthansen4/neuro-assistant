"use client";
import { useMemo, useState, useEffect } from "react";

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
    total_pages?: number | null;
  }[];
};

type CommitSummary = {
  courseId: string;
  courseName: string;
  counts: {
    assignmentsCreated: number;
    officeHoursSaved: number;
    scheduleSaved: number;
    classEventsCreated: number;
    officeHourEventsCreated: number;
  };
  timezone: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";
const CONF_THRESHOLD = 0.6;

function isHighStakes(category?: string | null) {
  if (!category) return false;
  const c = category.toLowerCase();
  return c.includes("exam") || c.includes("test") || c.includes("midterm") || c.includes("final") || c.includes("project");
}
function isRoutine(category?: string | null) {
  if (!category) return true;
  const c = category.toLowerCase();
  return c.includes("homework") || c.includes("reading") || c.includes("quiz") || c.includes("assignment");
}

export function SyllabusReview({
  parsed,
  parseRunId,
  userId,
  timezone,
  onImportAnother, // optional: parent can reset flow; falls back to reload
}: {
  parsed: ParsedSyllabus;
  parseRunId: string;
  userId: string;
  timezone?: string;
  onImportAnother?: () => void;
}) {
  const [assignments, setAssignments] = useState(
    parsed.assignments.map((a, idx) => ({
      id: idx.toString(),
      include: true,
      title: a.title,
      due_date: a.due_date || "",
      category: a.category || "",
      effort_estimate_minutes: a.effort_estimate_minutes ?? "",
      total_pages: a.total_pages ?? "",
      confidence: parsed.confidence ?? 0.5,
    }))
  );

  const initialWeights = useMemo(() => {
    const gw = parsed.course.grade_weights || {};
    return Object.entries(gw).map(([k, v], idx) => ({
      id: idx.toString(),
      include: true,
      name: k,
      weight: v,
    }));
  }, [parsed.course.grade_weights]);
  const [weights, setWeights] = useState(initialWeights);

  const [schedule, setSchedule] = useState(
    (parsed.course.schedule || []).map((s, idx) => ({ id: idx.toString(), include: true, ...s }))
  );
  const [officeHours, setOfficeHours] = useState(
    (parsed.course.office_hours || []).map((oh, idx) => ({ id: idx.toString(), include: true, ...oh }))
  );

  const [openHigh, setOpenHigh] = useState(true);
  const [openRoutine, setOpenRoutine] = useState(false);
  const [openSchedule, setOpenSchedule] = useState(true);
  const [openOffice, setOpenOffice] = useState(true);

  const highStakes = assignments.filter((a) => isHighStakes(a.category));
  const routine = assignments.filter((a) => !isHighStakes(a.category) && isRoutine(a.category));
  const lowConf = (c: number) => c < CONF_THRESHOLD;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [hasCommitted, setHasCommitted] = useState(false); // double-submit guard
  const [undoing, setUndoing] = useState(false);
  const [undoMsg, setUndoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 5500);
    return () => clearTimeout(t);
  }, [showToast]);

  async function onSave() {
    if (hasCommitted) return; // guard
    setSaving(true);
    setError(null);
    setSummary(null);
    setShowToast(false);
    setUndoMsg(null);

    try {
      const cleaned = {
        parseRunId,
        timezone: timezone || "UTC",
        course: {
          name: parsed.course.name,
          professor: parsed.course.professor || null,
          credits: parsed.course.credits ?? null,
          grade_weights: Object.fromEntries(
            weights.filter((w) => w.include && w.name.trim()).map((w) => [w.name.trim(), Number(w.weight || 0)])
          ),
        },
        schedule: schedule.filter((s) => s.include).map(({ day, start, end, location }) => ({ day, start, end, location })),
        office_hours: officeHours.filter((o) => o.include).map(({ day, start, end, location }) => ({ day, start, end, location })),
        assignments: assignments
          .filter((a) => a.include && a.title.trim())
          .map(({ title, due_date, category, effort_estimate_minutes, total_pages }) => ({
            title: title.trim(),
            due_date: due_date || null,
            category: category || null,
            effort_estimate_minutes: effort_estimate_minutes === "" ? null : Number(effort_estimate_minutes),
            total_pages: total_pages === "" ? null : Number(total_pages),
          })),
      };

      const res = await fetch(`${API_BASE}/api/upload/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-clerk-user-id": userId },
        body: JSON.stringify(cleaned),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "Commit failed");

      if (data?.summary) {
        setSummary(data.summary as CommitSummary);
        setShowToast(true);
        setHasCommitted(true); // disable Save after success
      }
    } catch (e: any) {
      setError(e.message || "Commit failed");
    } finally {
      setSaving(false);
    }
  }

  async function onUndo() {
    if (!parseRunId) return;
    setUndoing(true);
    setUndoMsg(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/upload/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-clerk-user-id": userId },
        body: JSON.stringify({ parseRunId }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "Rollback failed");
      setUndoMsg(`Rollback complete. Deleted ${data.deleted?.assignments ?? 0} assignments and ${data.deleted?.events ?? 0} events.`);
      setHasCommitted(false); // allow re-commit if desired
      setSummary(null); // Clear summary after undo
    } catch (e: any) {
      setError(e.message || "Rollback failed");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {showToast && summary && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-green-300 bg-green-50 px-4 py-3 shadow">
          <div className="text-sm font-medium text-green-800">Syllabus committed</div>
          <div className="mt-1 text-xs text-green-700">
            {summary.courseName}: {summary.counts.assignmentsCreated} assignments, {summary.counts.classEventsCreated} class events, {summary.counts.officeHourEventsCreated} office hour events.
          </div>
          <button className="mt-2 text-xs text-green-800 underline" onClick={() => setShowToast(false)}>Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">Review & Confirm</div>
          <div className="text-sm text-gray-600">Course: {parsed.course.name}</div>
        </div>
        <div className="text-xs">
          Confidence:{" "}
          <span className={`px-2 py-0.5 rounded ${lowConf(parsed.confidence) ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
            {Math.round((parsed.confidence ?? 0) * 100)}%
          </span>
        </div>
      </div>

      {/* Group A: High Stakes */}
      <section className="border rounded">
        <header
          onClick={() => setOpenHigh((v) => !v)}
          className="cursor-pointer px-4 py-2 flex items-center justify-between bg-gray-50"
        >
          <div className="font-medium">Group A: High Stakes (Exams, Projects, Midterms)</div>
          <div className="text-sm text-gray-600">{highStakes.length} item(s)</div>
        </header>
        {openHigh && (
          <div className="p-4 space-y-3">
            {highStakes.length === 0 && <div className="text-sm text-gray-500">No high-stakes items detected.</div>}
            {highStakes.map((a, idx) => (
              <div
                key={`high-${a.id}-${idx}`}
                className={`p-3 rounded border ${lowConf(a.confidence) ? "bg-yellow-50 border-yellow-200" : "bg-white"}`}
              >
                <div className="flex items-start justify-between">
                  <label className="text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.include}
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((x) => (x.id === a.id ? { ...x, include: e.target.checked } : x))
                        )
                      }
                    />
                    Include
                  </label>
                  <span className="text-xs text-gray-500">{a.category || "Uncategorized"}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <div className="text-xs text-gray-600">Title</div>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={a.title}
                      onChange={(e) =>
                        setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, title: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Date (ISO or yyyy-mm-dd)</div>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={a.due_date}
                      onChange={(e) =>
                        setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, due_date: e.target.value } : x)))
                      }
                    />
                  </div>
                  {a.category === "Reading" && (
                    <div>
                      <div className="text-xs text-gray-600">Total Pages</div>
                      <input
                        type="number"
                        className="w-full border rounded px-3 py-2"
                        value={a.total_pages}
                        onChange={(e) =>
                          setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, total_pages: e.target.value } : x)))
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Group B: Routine */}
      <section className="border rounded">
        <header
          onClick={() => setOpenRoutine((v) => !v)}
          className="cursor-pointer px-4 py-2 flex items-center justify-between bg-gray-50"
        >
          <div className="font-medium">Group B: Routine (Homework, Readings, Quizzes)</div>
          <div className="text-sm text-gray-600">{routine.length} item(s)</div>
        </header>
        {openRoutine && (
          <div className="p-4 space-y-3">
            {routine.length === 0 && <div className="text-sm text-gray-500">No routine items detected.</div>}
            {routine.map((a, idx) => (
              <div
                key={`routine-${a.id}-${idx}`}
                className={`p-3 rounded border ${lowConf(a.confidence) ? "bg-yellow-50 border-yellow-200" : "bg-white"}`}
              >
                <div className="flex items-start justify-between">
                  <label className="text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.include}
                      onChange={(e) =>
                        setAssignments((prev) =>
                          prev.map((x) => (x.id === a.id ? { ...x, include: e.target.checked } : x))
                        )
                      }
                    />
                    Include
                  </label>
                  <span className="text-xs text-gray-500">{a.category || "Uncategorized"}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <div className="text-xs text-gray-600">Title</div>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={a.title}
                      onChange={(e) =>
                        setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, title: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Date (ISO or yyyy-mm-dd)</div>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={a.due_date}
                      onChange={(e) =>
                        setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, due_date: e.target.value } : x)))
                      }
                    />
                  </div>
                  {a.category === "Reading" && (
                    <div>
                      <div className="text-xs text-gray-600">Total Pages</div>
                      <input
                        type="number"
                        className="w-full border rounded px-3 py-2"
                        value={a.total_pages}
                        onChange={(e) =>
                          setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, total_pages: e.target.value } : x)))
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Group C: Schedule */}
      <section className="border rounded">
        <header
          onClick={() => setOpenSchedule((v) => !v)}
          className="cursor-pointer px-4 py-2 flex items-center justify-between bg-gray-50"
        >
          <div className="font-medium">Group C: Schedule (Class times & Locations)</div>
          <div className="text-sm text-gray-600">{(schedule || []).length} item(s)</div>
        </header>
        {openSchedule && (
          <div className="p-4 space-y-2">
            {(schedule || []).length === 0 && <div className="text-sm text-gray-500">No schedule detected.</div>}
            {schedule.map((s) => (
              <div key={s.id} className="flex items-center justify-between border rounded px-3 py-2">
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.include}
                    onChange={(e) =>
                      setSchedule((prev) => prev.map((x) => (x.id === s.id ? { ...x, include: e.target.checked } : x)))
                    }
                  />
                  Include
                </label>
                <div className="text-sm">
                  {s.day} • {s.start}–{s.end} {s.location ? `• ${s.location}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Group D: Office Hours */}
      <section className="border rounded">
        <header
          onClick={() => setOpenOffice((v) => !v)}
          className="cursor-pointer px-4 py-2 flex items-center justify-between bg-gray-50"
        >
          <div className="font-medium">Group D: Office Hours (Optional Resources)</div>
          <div className="text-sm text-gray-600">{(officeHours || []).length} item(s)</div>
        </header>
        {openOffice && (
          <div className="p-4 space-y-2">
            {(officeHours || []).length === 0 && <div className="text-sm text-gray-500">No office hours detected.</div>}
            {officeHours.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between border rounded px-3 py-2"
                style={{ borderStyle: "dashed" }}
              >
                <label className="text-sm flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={o.include}
                    onChange={(e) =>
                      setOfficeHours((prev) => prev.map((x) => (x.id === o.id ? { ...x, include: e.target.checked } : x)))
                    }
                  />
                  Include
                </label>
                <div className="text-sm">
                  {o.day} • {o.start}–{o.end} {o.location ? `• ${o.location}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Grade Weights */}
      <section className="border rounded">
        <header className="px-4 py-2 bg-gray-50 font-medium">Grade Weights</header>
        <div className="p-4 space-y-2">
          {weights.length === 0 && <div className="text-sm text-gray-500">No grade weights detected.</div>}
          {weights.map((w) => (
            <div key={w.id} className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={w.include}
                  onChange={(e) => setWeights((prev) => prev.map((x) => (x.id === w.id ? { ...x, include: e.target.checked } : x)))}
                />
                Include
              </label>
              <input
                className="border rounded px-2 py-1 text-sm"
                value={w.name}
                onChange={(e) => setWeights((prev) => prev.map((x) => (x.id === w.id ? { ...x, name: e.target.value } : x)))}
                placeholder="Category"
              />
              <input
                className="border rounded px-2 py-1 text-sm w-24"
                type="number"
                value={w.weight}
                onChange={(e) => setWeights((prev) => prev.map((x) => (x.id === w.id ? { ...x, weight: Number(e.target.value) } : x)))}
                placeholder="%"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving || hasCommitted}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : hasCommitted ? "Saved" : "Save"}
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {undoMsg && <div className="text-sm text-green-700">{undoMsg}</div>}
      </div>

      {/* Summary panel */}
      {summary && (
        <div className="border rounded p-4 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Commit Summary</div>
              <div className="text-sm text-gray-600 mt-1">Course: {summary.courseName} • Timezone: {summary.timezone}</div>
            </div>
            <div className="flex items-center gap-2">
              <a href="/calendar" className="px-3 py-1.5 rounded border text-sm">Open Calendar</a>
              <button
                className="px-3 py-1.5 rounded border text-sm"
                onClick={() => (onImportAnother ? onImportAnother() : window.location.reload())}
              >
                Import Another
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-xs text-gray-500">Assignments Created</div>
              <div className="text-lg font-semibold">{summary.counts.assignmentsCreated}</div>
            </div>
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-xs text-gray-500">Class Events Created (14d)</div>
              <div className="text-lg font-semibold">{summary.counts.classEventsCreated}</div>
            </div>
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-xs text-gray-500">Office Hour Events Created (14d)</div>
              <div className="text-lg font-semibold">{summary.counts.officeHourEventsCreated}</div>
            </div>
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-xs text-gray-500">Schedule Items Saved</div>
              <div className="text-lg font-semibold">{summary.counts.scheduleSaved}</div>
            </div>
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-xs text-gray-500">Office Hours Saved</div>
              <div className="text-lg font-semibold">{summary.counts.officeHoursSaved}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onUndo}
              disabled={undoing}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-60"
            >
              {undoing ? "Undoing..." : "Undo Import"}
            </button>
          </div>

          <div className="mt-2 text-xs text-gray-500">
            Tip: Open your calendar to see recurring Class and Office Hours pre-seeded for the next two weeks.
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Items with low confidence are highlighted. You can adjust dates and titles before saving. Office Hours are treated as optional resources.
      </p>
    </div>
  );
}

