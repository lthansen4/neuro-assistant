"use client";

interface Assignment {
  id: string;
  title: string;
  dueDate: string | null;
  category: string | null;
  status: "Inbox" | "Scheduled" | "Locked_In" | "Completed";
  effortEstimateMinutes: number | null;
  courseId: string | null;
  courseName: string | null;
  createdAt: string;
  submittedAt?: string | null;
}

interface AssignmentsListProps {
  assignments: Assignment[];
  title: string;
  emptyMessage?: string;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "No due date";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""} ago`;
    } else if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Tomorrow";
    } else if (diffDays <= 7) {
      return `In ${diffDays} days`;
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
    }
  } catch {
    return dateString;
  }
}

function getStatusColor(status: Assignment["status"]): string {
  switch (status) {
    case "Inbox":
      return "bg-gray-100 text-gray-700 border-gray-300";
    case "Scheduled":
      return "bg-blue-50 text-blue-700 border-blue-300";
    case "Locked_In":
      return "bg-orange-50 text-orange-700 border-orange-300";
    case "Completed":
      return "bg-green-50 text-green-700 border-green-300";
    default:
      return "bg-gray-100 text-gray-700 border-gray-300";
  }
}

function formatEffort(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function AssignmentsList({ assignments, title, emptyMessage = "No assignments" }: AssignmentsListProps) {
  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{assignments.length} assignment{assignments.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="divide-y">
        {assignments.map((assignment) => {
          const dueDateFormatted = formatDate(assignment.dueDate);
          const effortFormatted = formatEffort(assignment.effortEstimateMinutes);
          const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date() && assignment.status !== "Completed";

          return (
            <div key={assignment.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-gray-900 truncate">{assignment.title}</h4>
                    {assignment.category && (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 whitespace-nowrap">
                        {assignment.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {assignment.courseName && (
                      <span className="font-medium text-gray-700">{assignment.courseName}</span>
                    )}
                    <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                      {dueDateFormatted}
                    </span>
                    {effortFormatted && (
                      <span>• {effortFormatted}</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(assignment.status)} whitespace-nowrap`}>
                  {assignment.status.replace("_", " ")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

