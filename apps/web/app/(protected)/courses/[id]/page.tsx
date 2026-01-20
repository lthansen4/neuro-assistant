"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CourseEditor, CourseFormData } from "../../../components/CourseEditor";
import { fetchCourseDetail, updateCourseDetail } from "../../../lib/api";

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params?.id as string;
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<CourseFormData | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    if (!isLoaded || !user || !courseId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchCourseDetail(user.id, courseId);
        const course = result.course;
        const gradeWeights = course.gradeWeightsJson
          ? Object.entries(course.gradeWeightsJson).map(([name, weight]) => ({
              name,
              weight: String(weight),
            }))
          : [];
        setInitialData({
          name: course.name,
          professor: course.professor ?? "",
          credits: course.credits ?? 0,
          gradeWeights,
          schedule: result.schedule || [],
          officeHours: result.office_hours || [],
          newAssignments: [],
        });
        setAssignments(result.assignments || []);
      } catch (err: any) {
        setError(err.message || "Failed to load course");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isLoaded, user, courseId]);

  const handleSave = async (data: CourseFormData) => {
    if (!user) return;
    const grade_weights = (data.gradeWeights || []).reduce<Record<string, number>>((acc, item) => {
      if (item.name && item.weight) {
        acc[item.name] = Number(item.weight);
      }
      return acc;
    }, {});
    await updateCourseDetail(user.id, courseId, {
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
      })),
    });
    router.refresh();
  };

  if (loading) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-12 text-gray-600">Loading course...</div>
      </main>
    );
  }

  if (error || !initialData) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error || "Course not found"}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Course</h1>
        <p className="text-sm text-gray-600">
          Changes here update future class and office hour events (and refresh nudges).
        </p>
      </header>
      <CourseEditor
        initial={initialData}
        assignments={assignments}
        onSubmit={handleSave}
        submitLabel="Save Changes"
      />
    </main>
  );
}

