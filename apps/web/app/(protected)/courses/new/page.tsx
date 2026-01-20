"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CourseEditor, CourseFormData } from "../../../../components/CourseEditor";
import { createCourse } from "../../../../lib/api";

export default function NewCoursePage() {
  const router = useRouter();
  const { user } = useUser();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial: CourseFormData = {
    name: "",
    professor: "",
    credits: 3,
    gradeWeights: [],
    schedule: [],
    officeHours: [],
    newAssignments: [],
  };

  const handleCreate = async (data: CourseFormData) => {
    if (!user) return;
    
    try {
      setCreating(true);
      setError(null);
      
      const invalidManual = (data.newAssignments || []).find(
        (item) =>
          item.scheduleMode === "manual" &&
          (!item.sessionStart || !item.sessionEnd)
      );
      if (invalidManual) {
        setError("Please provide a start and end time for manual scheduling.");
        setCreating(false);
        return;
      }

      const grade_weights = (data.gradeWeights || []).reduce<Record<string, number>>((acc, item) => {
        if (item.name && item.weight) {
          acc[item.name] = Number(item.weight);
        }
        return acc;
      }, {});
      
      const result = await createCourse(user.id, {
        course: {
          name: data.name,
          professor: data.professor || null,
          credits: data.credits ?? null,
          grade_weights: Object.keys(grade_weights).length ? grade_weights : null,
        },
        schedule: data.schedule,
        office_hours: data.officeHours,
        assignments: (data.newAssignments || []).map((item) => ({
          title: item.title,
          due_date: item.dueDate || null,
          category: item.category || null,
          effort_estimate_minutes: item.effortMinutes ? Number(item.effortMinutes) : null,
          schedule_mode: item.scheduleMode || "auto",
          session_start: item.sessionStart ? new Date(item.sessionStart).toISOString() : null,
          session_end: item.sessionEnd ? new Date(item.sessionEnd).toISOString() : null,
        })),
      });
      
      if (result?.courseId) {
        router.push(`/courses/${result.courseId}`);
      } else {
        router.push("/courses");
      }
    } catch (err: any) {
      console.error("Failed to create course:", err);
      setError(err.message || "Failed to create course. Please try again.");
      setCreating(false);
    }
  };

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Add Course</h1>
        <p className="text-sm text-gray-600">
          Create a course manually when you don't have a downloadable syllabus.
        </p>
      </header>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center justify-between">
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
            ✕
          </button>
        </div>
      )}
      
      <CourseEditor 
        initial={initial} 
        onSubmit={handleCreate} 
        submitLabel="Create Course"
        loading={creating}
      />
    </main>
  );
}

