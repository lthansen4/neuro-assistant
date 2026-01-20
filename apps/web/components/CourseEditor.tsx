"use client";

import { useEffect, useState } from "react";

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export interface CourseFormData {
  name: string;
  professor?: string | null;
  credits?: number | null;
  gradeWeights?: Array<{ name: string; weight: string }>;
  schedule: Array<{ day: string; start: string; end: string; location?: string | null }>;
  officeHours: Array<{ day: string; start: string; end: string; location?: string | null }>;
  newAssignments?: Array<{
    title: string;
    dueDate?: string;
    category?: string;
    effortMinutes?: string;
    scheduleMode?: "auto" | "manual" | "none";
    sessionStart?: string;
    sessionEnd?: string;
  }>;
}

export interface CourseAssignment {
  id: string;
  title: string;
  dueDate?: string | null;
  category?: string | null;
  effortEstimateMinutes?: number | null;
}

interface CourseEditorProps {
  initial: CourseFormData;
  assignments?: CourseAssignment[];
  onSubmit: (data: CourseFormData) => Promise<void>;
  submitLabel: string;
  loading?: boolean;
  onQuickAdd?: () => void;
}

export function CourseEditor({
  initial,
  assignments = [],
  onSubmit,
  submitLabel,
  loading = false,
  onQuickAdd,
}: CourseEditorProps) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:46',message:'CourseEditor rendered',data:{initialName:initial.name,initialScheduleCount:initial.schedule.length,loading},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H6'})}).catch(()=>{});
  // #endregion
  
  const [form, setForm] = useState<CourseFormData>(initial);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:57',message:'form name changed',data:{formName:form.name,initialName:initial.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H7,H8'})}).catch(()=>{});
    // #endregion
  }, [form.name, initial.name]);

  const updateSchedule = (idx: number, patch: Partial<CourseFormData["schedule"][number]>) => {
    const next = [...form.schedule];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, schedule: next });
  };

  const updateOfficeHours = (idx: number, patch: Partial<CourseFormData["officeHours"][number]>) => {
    const next = [...form.officeHours];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, officeHours: next });
  };

  const updateGradeWeight = (
    idx: number,
    patch: Partial<NonNullable<CourseFormData["gradeWeights"]>[number]>
  ) => {
    const next = [...(form.gradeWeights || [])];
    const prevKey = `${next[idx]?.name ?? ""}-${idx}`;
    next[idx] = { ...next[idx], ...patch };
    const nextKey = `${next[idx]?.name ?? ""}-${idx}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:74',message:'grade weight update',data:{idx,prevKey,nextKey,prevName:next[idx]?.name,prevWeight:next[idx]?.weight},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:74',message:'grade weight update',data:{idx,prevKey,nextKey},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    setForm({ ...form, gradeWeights: next });
  };

  const updateNewAssignment = (idx: number, patch: Partial<NonNullable<CourseFormData["newAssignments"]>[number]>) => {
    const next = [...(form.newAssignments || [])];
    const prevKey = `${next[idx]?.title ?? ""}-${idx}`;
    next[idx] = { ...next[idx], ...patch };
    const nextKey = `${next[idx]?.title ?? ""}-${idx}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:87',message:'new assignment update',data:{idx,prevKey,nextKey},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:87',message:'new assignment update',data:{idx,prevKey,nextKey},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    setForm({ ...form, newAssignments: next });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="bg-white rounded-lg border p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Course Info</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-sm font-semibold text-gray-900">Name</label>
            <input
              value={form.name}
              onInput={(e) => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:102',message:'name input onInput',data:{inputValue:(e.target as HTMLInputElement).value},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H7,H8'})}).catch(()=>{});
                // #endregion
              }}
              onChange={(e) => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:101',message:'name input onChange',data:{oldValue:form.name,newValue:e.target.value,formStateBeforeChange:JSON.stringify(form).substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H7,H8'})}).catch(()=>{});
                // #endregion
                setForm({ ...form, name: e.target.value });
              }}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-900">Credits</label>
            <input
              type="number"
              value={form.credits ?? ""}
              onChange={(e) => setForm({ ...form, credits: Number(e.target.value) || 0 })}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-sm font-semibold text-gray-900">Professor</label>
            <input
              value={form.professor ?? ""}
              onInput={(e) => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:119',message:'professor input onInput',data:{inputValue:(e.target as HTMLInputElement).value},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H7,H8'})}).catch(()=>{});
                // #endregion
              }}
              onChange={(e) => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CourseEditor.tsx:118',message:'professor input onChange',data:{oldValue:form.professor,newValue:e.target.value},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H7,H8'})}).catch(()=>{});
                // #endregion
                setForm({ ...form, professor: e.target.value });
              }}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Class Schedule</h2>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                schedule: [...form.schedule, { day: "Monday", start: "09:00", end: "10:00", location: "" }],
              })
            }
            className="text-sm text-blue-600 font-semibold"
          >
            + Add
          </button>
        </div>
        {form.schedule.length === 0 && (
          <div className="text-sm text-gray-500">No class meetings yet.</div>
        )}
        {form.schedule.map((item, idx) => (
          <div key={`${item.day}-${idx}`} className="grid gap-2 md:grid-cols-5 items-center">
            <select
              value={item.day}
              onChange={(e) => updateSchedule(idx, { day: e.target.value })}
              className="border rounded px-2 py-2"
            >
              {DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={item.start}
              onChange={(e) => updateSchedule(idx, { start: e.target.value })}
              className="border rounded px-2 py-2"
            />
            <input
              type="time"
              value={item.end}
              onChange={(e) => updateSchedule(idx, { end: e.target.value })}
              className="border rounded px-2 py-2"
            />
            <input
              placeholder="Location"
              value={item.location ?? ""}
              onChange={(e) => updateSchedule(idx, { location: e.target.value })}
              className="border rounded px-2 py-2 md:col-span-2"
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, schedule: form.schedule.filter((_, i) => i !== idx) })}
              className="text-xs text-red-600 md:col-span-5 justify-self-end"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Office Hours</h2>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                officeHours: [...form.officeHours, { day: "Monday", start: "09:00", end: "10:00", location: "" }],
              })
            }
            className="text-sm text-blue-600 font-semibold"
          >
            + Add
          </button>
        </div>
        {form.officeHours.length === 0 && (
          <div className="text-sm text-gray-500">No office hours yet.</div>
        )}
        {form.officeHours.map((item, idx) => (
          <div key={`${item.day}-${idx}`} className="grid gap-2 md:grid-cols-5 items-center">
            <select
              value={item.day}
              onChange={(e) => updateOfficeHours(idx, { day: e.target.value })}
              className="border rounded px-2 py-2"
            >
              {DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={item.start}
              onChange={(e) => updateOfficeHours(idx, { start: e.target.value })}
              className="border rounded px-2 py-2"
            />
            <input
              type="time"
              value={item.end}
              onChange={(e) => updateOfficeHours(idx, { end: e.target.value })}
              className="border rounded px-2 py-2"
            />
            <input
              placeholder="Location"
              value={item.location ?? ""}
              onChange={(e) => updateOfficeHours(idx, { location: e.target.value })}
              className="border rounded px-2 py-2 md:col-span-2"
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, officeHours: form.officeHours.filter((_, i) => i !== idx) })}
              className="text-xs text-red-600 md:col-span-5 justify-self-end"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Grade Weights</h2>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                gradeWeights: [...(form.gradeWeights || []), { name: "", weight: "" }],
              })
            }
            className="text-sm text-blue-600 font-semibold"
          >
            + Add
          </button>
        </div>
        {(form.gradeWeights || []).length === 0 && (
          <div className="text-sm text-gray-500">No grading breakdown yet.</div>
        )}
        {(form.gradeWeights || []).map((item, idx) => (
          <div key={`grade-weight-${idx}`} className="grid gap-2 md:grid-cols-5 items-center">
            <input
              placeholder="Category"
              value={item.name}
              onChange={(e) => updateGradeWeight(idx, { name: e.target.value })}
              className="border rounded px-2 py-2 md:col-span-3"
            />
            <input
              type="number"
              placeholder="%"
              value={item.weight}
              onChange={(e) => updateGradeWeight(idx, { weight: e.target.value })}
              className="border rounded px-2 py-2 md:col-span-1"
            />
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  gradeWeights: (form.gradeWeights || []).filter((_, i) => i !== idx),
                })
              }
              className="text-xs text-red-600 md:col-span-1 justify-self-end"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      {assignments.length > 0 && (
        <section className="bg-white rounded-lg border p-4 space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Assignments</h2>
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="border rounded p-3 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">{assignment.title}</div>
                <div>
                  {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : "No due date"} ·{" "}
                  {assignment.category || "Uncategorized"} · {assignment.effortEstimateMinutes ?? 0} min
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Assignments</h2>
          {onQuickAdd && (
            <button
              type="button"
              onClick={onQuickAdd}
              className="text-sm text-blue-600 font-semibold"
            >
              + Add (Quick Add)
            </button>
          )}
          {!onQuickAdd && (
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  newAssignments: [...(form.newAssignments || []), { title: "", dueDate: "", category: "Homework", effortMinutes: "90", scheduleMode: "auto", sessionStart: "", sessionEnd: "" }],
                })
              }
              className="text-sm text-blue-600 font-semibold"
            >
              + Add
            </button>
          )}
        </div>
        {onQuickAdd ? (
          <div className="text-sm text-gray-500">
            Use Quick Add to create assignments and auto-schedule time for them.
          </div>
        ) : (
          <>
            {(form.newAssignments || []).length === 0 && (
              <div className="text-sm text-gray-500">No new assignments added.</div>
            )}
            {(form.newAssignments || []).map((item, idx) => (
              <div key={`new-assignment-${idx}`} className="grid gap-2 md:grid-cols-5 items-center">
                <input
                  placeholder="Title"
                  value={item.title}
                  onChange={(e) => updateNewAssignment(idx, { title: e.target.value })}
                  className="border rounded px-2 py-2 md:col-span-2"
                />
                <input
                  type="date"
                  value={item.dueDate || ""}
                  onChange={(e) => updateNewAssignment(idx, { dueDate: e.target.value })}
                  className="border rounded px-2 py-2"
                />
                <select
                  value={item.category || "Homework"}
                  onChange={(e) => updateNewAssignment(idx, { category: e.target.value })}
                  className="border rounded px-2 py-2"
                >
                  <option value="Homework">Homework</option>
                  <option value="Exam">Exam</option>
                  <option value="Quiz">Quiz</option>
                  <option value="Midterm">Midterm</option>
                  <option value="Final">Final</option>
                  <option value="Project">Project</option>
                  <option value="Reading">Reading</option>
                </select>
                <input
                  type="number"
                  placeholder="Minutes"
                  value={item.effortMinutes || ""}
                  onChange={(e) => updateNewAssignment(idx, { effortMinutes: e.target.value })}
                  className="border rounded px-2 py-2"
                />
                <select
                  value={item.scheduleMode || "auto"}
                  onChange={(e) => updateNewAssignment(idx, { scheduleMode: e.target.value as "auto" | "manual" | "none" })}
                  className="border rounded px-2 py-2 md:col-span-2"
                >
                  <option value="auto">Auto-schedule time</option>
                  <option value="manual">Schedule time now</option>
                  <option value="none">Don’t schedule</option>
                </select>
                {item.scheduleMode === "manual" && (
                  <>
                    <input
                      type="datetime-local"
                      value={item.sessionStart || ""}
                      onChange={(e) => updateNewAssignment(idx, { sessionStart: e.target.value })}
                      className="border rounded px-2 py-2 md:col-span-2"
                    />
                    <input
                      type="datetime-local"
                      value={item.sessionEnd || ""}
                      onChange={(e) => updateNewAssignment(idx, { sessionEnd: e.target.value })}
                      className="border rounded px-2 py-2 md:col-span-2"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      newAssignments: (form.newAssignments || []).filter((_, i) => i !== idx),
                    })
                  }
                  className="text-xs text-red-600 md:col-span-5 justify-self-end"
                >
                  Remove
                </button>
              </div>
            ))}
          </>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || submitting}
          className="px-6 py-3 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-400"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </div>
  );
}

