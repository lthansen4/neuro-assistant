"use client";
import { useEffect, useMemo, useState } from "react";

// TEMP: Set your seeded DB user UUID (printed by seed script).
// Replace with Clerk->DB mapping once available.
const USER_UUID = process.env.NEXT_PUBLIC_DEBUG_USER_ID || ""; // fill for dev
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

type Suggestion =
  | { type: "alias"; label: string; courseId: string; confidence: number }
  | { type: "course"; label: string; courseId: string; confidence: number };

type ParseResponse = {
  parsed: {
    courseHint: string;
    title: string;
    category?: string;
    dueDateISO?: string;
    effortMinutes?: number;
    confidence: number;
  };
  suggestions: Suggestion[];
  dedupeHash: string;
  confidence: number;
  error?: string;
};

export function QuickAdd() {
  const [userId, setUserId] = useState<string>(USER_UUID);
  const [text, setText] = useState("");
  const [timezone, setTimezone] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseRes, setParseRes] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable fields after parse
  const [courseId, setCourseId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [dueDateISO, setDueDateISO] = useState<string>("");
  const [effortMinutes, setEffortMinutes] = useState<number | "">("");

  // Optional focus session
  const [createFocusSession, setCreateFocusSession] = useState(false);
  const [sessionStartISO, setSessionStartISO] = useState<string>("");
  const [sessionEndISO, setSessionEndISO] = useState<string>("");

  // Alias save toggle
  const [saveAlias, setSaveAlias] = useState(false);
  const [aliasText, setAliasText] = useState("");

  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<null | { createdAssignmentId?: string; createdEventId?: string; deduped?: boolean }>(null);

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setTimezone(tz);
    } catch {
      setTimezone("UTC");
    }
  }, []);

  // When parse result arrives, prefill editable fields
  useEffect(() => {
    if (!parseRes) return;
    const p = parseRes.parsed;
    setTitle(p.title || "");
    setCategory(p.category || "");
    setDueDateISO(p.dueDateISO || "");
    setEffortMinutes(p.effortMinutes ?? "");
    // auto-pick best suggestion if it's confident
    if (parseRes.suggestions?.length) {
      const best = [...parseRes.suggestions].sort((a, b) => b.confidence - a.confidence)[0];
      if (best && best.confidence >= 0.7) setCourseId(best.courseId);
    }
  }, [parseRes]);

  const confidencePct = useMemo(() => {
    const c = parseRes?.confidence ?? 0;
    return Math.round(c * 100);
  }, [parseRes]);

  async function onParse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCommitResult(null);

    if (!userId) {
      setError("Missing userId (DB UUID). For dev, set NEXT_PUBLIC_DEBUG_USER_ID or type one below.");
      return;
    }
    if (!text.trim()) {
      setError("Please enter something to parse (e.g., 'Math test Friday 3pm').");
      return;
    }
    try {
      setIsParsing(true);
      const res = await fetch(`${API_BASE}/api/quick-add/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ text, timezone }),
      });
      const data: ParseResponse = await res.json();
      if (!res.ok || (data as any).error) {
        throw new Error((data as any).error || "Parse failed");
      }
      setParseRes(data);
    } catch (err: any) {
      setError(err.message || "Parse failed");
    } finally {
      setIsParsing(false);
    }
  }

  async function onCommit() {
    if (!parseRes) return;
    setError(null);
    setCommitResult(null);

    if (!userId) {
      setError("Missing userId.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      setIsCommitting(true);
      const body = {
        rawInput: text,
        dedupeHash: parseRes.dedupeHash,
        parsed: {
          courseId: courseId || undefined,
          title: title.trim(),
          category: category || undefined,
          dueDateISO: dueDateISO || undefined,
          effortMinutes: effortMinutes === "" ? undefined : Number(effortMinutes),
          createFocusSession: createFocusSession || undefined,
          sessionStartISO: sessionStartISO || undefined,
          sessionEndISO: sessionEndISO || undefined,
          confidence: parseRes.confidence,
        },
        saveAlias: saveAlias && aliasText && courseId ? { alias: aliasText.trim(), courseId } : null,
      };

      const res = await fetch(`${API_BASE}/api/quick-add/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Commit failed");
      }
      setCommitResult({
        createdAssignmentId: data.createdAssignmentId,
        createdEventId: data.createdEventId,
        deduped: data.deduped,
      });
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Dev-only userId input until Clerk->DB mapping is wired */}
      <div className="space-y-1">
        <label className="text-sm font-medium">User ID (DB UUID, dev)</label>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="paste users.id from seed output"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      <form onSubmit={onParse} className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Quick Add text</label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g., "Math test Friday 3pm"'
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Timezone</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500">Auto-detected. You can override if needed.</p>
        </div>

        <button
          type="submit"
          disabled={isParsing}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {isParsing ? "Parsing..." : "Parse"}
        </button>
      </form>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {parseRes && (
        <div className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Parse Preview</div>
            <div className="text-xs">
              Confidence:{" "}
              <span className={`px-2 py-0.5 rounded ${confidencePct >= 70 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {confidencePct}%
              </span>
            </div>
          </div>

          {/* Suggestions */}
          {parseRes.suggestions?.length ? (
            <div className="space-y-1">
              <div className="text-sm font-medium">Course Suggestions</div>
              <div className="flex flex-wrap gap-2">
                {parseRes.suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCourseId(s.courseId)}
                    className={`px-2 py-1 rounded border text-sm ${courseId === s.courseId ? "bg-blue-50 border-blue-300" : "bg-white"}`}
                    title={`${s.type} • conf ${Math.round(s.confidence * 100)}%`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No course suggestions found.</p>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Course ID</label>
              <input
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                placeholder="optional"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder='e.g., "Exam", "Homework"'
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Due (ISO)</label>
              <input
                value={dueDateISO}
                onChange={(e) => setDueDateISO(e.target.value)}
                placeholder="2026-02-20T15:00:00-05:00"
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Effort (min)</label>
              <input
                value={effortMinutes}
                onChange={(e) => setEffortMinutes(e.target.value === "" ? "" : Number(e.target.value))}
                type="number"
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          {/* Optional Focus Session */}
          <div className="space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createFocusSession}
                onChange={(e) => setCreateFocusSession(e.target.checked)}
              />
              Create a Focus session
            </label>
            {createFocusSession && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Session start (ISO)</label>
                  <input
                    value={sessionStartISO}
                    onChange={(e) => setSessionStartISO(e.target.value)}
                    placeholder="2026-02-19T18:00:00-05:00"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Session end (ISO)</label>
                  <input
                    value={sessionEndISO}
                    onChange={(e) => setSessionEndISO(e.target.value)}
                    placeholder="2026-02-19T19:00:00-05:00"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Alias toggle */}
          <div className="space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveAlias} onChange={(e) => setSaveAlias(e.target.checked)} />
              Save alias for this course
            </label>
            {saveAlias && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Alias</label>
                  <input
                    value={aliasText}
                    onChange={(e) => setAliasText(e.target.value)}
                    placeholder='e.g., "Math"'
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCommit}
              disabled={isCommitting}
              className="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-60"
            >
              {isCommitting ? "Committing..." : "Create"}
            </button>
            <button
              onClick={() => {
                setParseRes(null);
                setCommitResult(null);
              }}
              className="px-3 py-2 rounded border"
            >
              Reset
            </button>
          </div>

          {commitResult && (
            <div className="text-sm">
              <div className="text-green-700">
                {commitResult.deduped ? "Deduped (existing item)." : "Created."}
              </div>
              {commitResult.createdAssignmentId && (
                <div>Assignment: {commitResult.createdAssignmentId}</div>
              )}
              {commitResult.createdEventId && (
                <div>Event: {commitResult.createdEventId}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


