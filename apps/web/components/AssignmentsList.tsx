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
    <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl">
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 to-blue-50/50">
        <h3 className="text-lg font-bold text-gray-800 tracking-tight">{title}</h3>
        <p className="text-xs font-medium text-indigo-600/70 mt-0.5 uppercase tracking-wider">
          {assignments.length} {assignments.length === 1 ? "Task" : "Tasks"}
        </p>
      </div>
      <div className="divide-y divide-gray-50">
        {assignments.map((assignment) => {
          const dueDateFormatted = formatDate(assignment.dueDate);
          const effortFormatted = formatEffort(assignment.effortEstimateMinutes);
          const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date() && assignment.status !== "Completed";

          return (
            <div 
              key={assignment.id} 
              className="group p-5 hover:bg-indigo-50/30 transition-all duration-200 cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    <h4 className="text-base font-semibold text-gray-900 leading-tight group-hover:text-indigo-700 transition-colors">
                      {assignment.title}
                    </h4>
                    {assignment.category && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-tighter">
                        {assignment.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 font-medium">
                    {assignment.courseName && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                        {assignment.courseName}
                      </div>
                    )}
                    <span className={`flex items-center gap-1 ${isOverdue ? "text-rose-600 font-bold" : "text-gray-400"}`}>
                      {isOverdue && "⚠️ "}{dueDateFormatted}
                    </span>
                    {effortFormatted && (
                      <span className="text-gray-400 font-normal opacity-70">
                        • {effortFormatted}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm border ${getStatusColor(assignment.status)} whitespace-nowrap uppercase tracking-wide`}>
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

