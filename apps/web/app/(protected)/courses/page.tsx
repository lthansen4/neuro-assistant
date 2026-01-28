"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { fetchCourses } from "../../../lib/api";

interface Course {
  id: string;
  name: string;
  professor?: string | null;
  credits?: number | null;
  currentGrade?: number | null;
  letterGrade?: string | null;
  gradeUpdatedAt?: string | null;
}

export default function CoursesPage() {
  const { user, isLoaded } = useUser();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchCourses(user.id);
        setCourses(result.items || []);
      } catch (err: any) {
        setError(err.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isLoaded, user]);

  if (loading) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-12 text-gray-600">Loading courses...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error}
        </div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-600">
            View and edit course details, schedules, and office hours.
          </p>
        </div>
        <Link
          href="/courses/new"
          className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          Add Course
        </Link>
      </header>

      {courses.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
          No courses yet. Add your first course to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="border rounded-lg p-4 bg-white hover:border-blue-400 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">{course.name}</div>
                  <div className="text-sm text-gray-600">
                    {course.professor || "Professor not set"} · {course.credits ?? 0} credits
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {course.currentGrade !== null && course.currentGrade !== undefined ? (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {course.letterGrade || "N/A"}
                      </div>
                      <div className="text-sm text-gray-500">
                        {course.currentGrade.toFixed(1)}%
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No grades yet</span>
                  )}
                  <span className="text-sm text-blue-600 font-semibold">Edit</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

