// lib/api.ts - API client utilities
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

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
      throw new Error(`Cannot connect to API server at ${API_BASE}. Make sure the API server is running on port 8787.`);
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

