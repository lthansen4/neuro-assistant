"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CourseEditor, CourseFormData } from "../../../../components/CourseEditor";
import { createCourse } from "../../../../lib/api";

export default function NewCoursePage() {
  const router = useRouter();
  const { user } = useUser();

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
      })),
    });
    if (result?.courseId) {
      router.push(`/courses/${result.courseId}`);
    } else {
      router.push("/courses");
    }
  };

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Add Course</h1>
        <p className="text-sm text-gray-600">
          Create a course manually when you don’t have a downloadable syllabus.
        </p>
      </header>
      <CourseEditor initial={initial} onSubmit={handleCreate} submitLabel="Create Course" />
    </main>
  );
}

