"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

export interface AssignmentEditData {
  id: string;
  title: string;
  dueDate: string | null;
  category: string | null;
  effortEstimateMinutes: number | null;
  status: "Inbox" | "Scheduled" | "Locked_In" | "Completed";
  courseName: string | null;
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function AssignmentEditModal({
  assignment,
  userId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  assignment: AssignmentEditData;
  userId: string;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [dueDate, setDueDate] = useState(toLocalDateTimeValue(assignment.dueDate));
  const [category, setCategory] = useState(assignment.category || "");
  const [effortMinutes, setEffortMinutes] = useState<string>(
    assignment.effortEstimateMinutes ? String(assignment.effortEstimateMinutes) : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        category: category || null,
        effortEstimateMinutes: effortMinutes ? Number(effortMinutes) : null,
      };
      const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to update assignment.");
      }
      onUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to update assignment.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${assignment.title}"? This will remove related calendar events too.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/assignments/${assignment.id}`, {
        method: "DELETE",
        headers: {
          "x-clerk-user-id": userId,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to delete assignment.");
      }
      onDeleted();
    } catch (err: any) {
      setError(err.message || "Failed to delete assignment.");
      setDeleting(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/adhd/complete/${assignment.id}`, {
        method: "POST",
        headers: {
          "x-clerk-user-id": userId,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to mark assignment complete.");
      }
      onUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to mark assignment complete.");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-xl max-w-lg w-full mx-4 p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-brand-text">Edit Assignment</h2>
            {assignment.courseName && (
              <p className="text-sm text-brand-muted">{assignment.courseName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-brand-muted hover:text-brand-text text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-brand-text">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-brand-border rounded-2xl px-4 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-brand-text">Due date</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-brand-border rounded-2xl px-4 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-brand-text">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-brand-border rounded-2xl px-4 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-brand-text">Effort (minutes)</label>
            <input
              type="number"
              min={0}
              value={effortMinutes}
              onChange={(e) => setEffortMinutes(e.target.value)}
              className="w-full border border-brand-border rounded-2xl px-4 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            className="w-full bg-brand-mint text-white hover:brightness-110"
            onClick={handleComplete}
            disabled={completing}
          >
            {completing ? "Marking..." : "Done"}
          </Button>

          <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-3">
            <Button
              variant="ghost"
              className={cn("text-rose-600 hover:text-rose-700", deleting && "opacity-60")}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

