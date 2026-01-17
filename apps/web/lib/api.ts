// lib/api.ts - API client utilities
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

export async function fetchDashboardSummary(userId: string, range: "day" | "week" = "week") {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/summary?range=${range}`, {
      headers: { "x-clerk-user-id": userId },
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`Failed to fetch dashboard summary: ${res.status} ${errorText}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.message.includes("fetch")) {
      throw new Error(`Cannot connect to API server at ${API_BASE}. Make sure the API server is running and accessible.`);
    }
    throw err;
  }
}

export async function fetchDashboardPreferences(userId: string) {
  const res = await fetch(`${API_BASE}/api/dashboard/preferences`, {
    headers: { "x-clerk-user-id": userId },
  });
  if (!res.ok) throw new Error("Failed to fetch preferences");
  return res.json();
}

export async function updateDashboardPreferences(
  userId: string,
  prefs: { defaultRange?: "day" | "week"; showGradeForecast?: boolean; showChillBank?: boolean }
) {
  const res = await fetch(`${API_BASE}/api/dashboard/preferences`, {
    method: "PUT",
    headers: {
      "x-clerk-user-id": userId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("Failed to update preferences");
  return res.json();
}

// Syllabus review endpoints
export async function fetchStagedItems(parseRunId: string, clerkUserId: string) {
  const res = await fetch(`${API_BASE}/api/upload/review/${parseRunId}`, {
    headers: { "x-clerk-user-id": clerkUserId },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || "Failed to fetch staged items");
  }
  return res.json();
}

export async function commitStagedItems(parseRunId: string, clerkUserId: string) {
  const res = await fetch(`${API_BASE}/api/upload/commit`, {
    method: "POST",
    headers: {
      "x-clerk-user-id": clerkUserId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parseRunId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || "Failed to commit items");
  }
  return res.json();
}

export async function fetchCalendarEvents(userId: string, start: Date, end: Date) {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  });
  const res = await fetch(`${API_BASE}/api/calendar/events?${params.toString()}`, {
    headers: { "x-clerk-user-id": userId },
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to fetch calendar events: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function fetchOverlappingAssignments(userId: string, start: string, end: string) {
  const res = await fetch(`${API_BASE}/api/calendar/overlap-assignments?start=${start}&end=${end}`, {
    headers: { "x-clerk-user-id": userId },
  });
  if (!res.ok) throw new Error("Failed to fetch overlapping assignments");
  return res.json();
}

export async function searchAssignments(userId: string, query: string) {
  const res = await fetch(`${API_BASE}/api/assignments/search?q=${encodeURIComponent(query)}`, {
    headers: { "x-clerk-user-id": userId },
  });
  if (!res.ok) throw new Error("Failed to search assignments");
  return res.json();
}

export async function updateAssignment(
  userId: string,
  assignmentId: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    dueDate?: string;
    pagesCompleted?: number;
    totalPages?: number;
    problemsCompleted?: number;
    totalProblems?: number;
    completionPercentage?: number;
    status?: string;
    professorQuestions?: string[];
    questionsTarget?: string;
  }
) {
  const res = await fetch(`${API_BASE}/api/assignments/${assignmentId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-clerk-user-id": userId,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update assignment");
  return res.json();
}

export async function scheduleProfessorReminder(
  userId: string,
  assignmentId: string,
  questions: string[],
  target: "Class" | "OfficeHours"
) {
  const res = await fetch(`${API_BASE}/api/assignments/${assignmentId}/schedule-reminder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-clerk-user-id": userId,
    },
    body: JSON.stringify({ questions, target }),
  });
  if (!res.ok) throw new Error("Failed to schedule reminder");
  return res.json();
}

export async function scheduleRemainingWork(
  userId: string,
  assignmentId: string,
  minutesNeeded: number
) {
  const res = await fetch(`${API_BASE}/api/assignments/${assignmentId}/schedule-remaining`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-clerk-user-id": userId,
    },
    body: JSON.stringify({ minutesNeeded }),
  });
  if (!res.ok) throw new Error("Failed to schedule remaining work");
  return res.json();
}

export async function createSession(
  userId: string,
  payload: { type: "Focus" | "Chill"; startTime: string; endTime: string; assignmentId?: string | null }
) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-clerk-user-id": userId,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to create session: ${res.status} ${errorText}`);
  }
  return res.json();
}

