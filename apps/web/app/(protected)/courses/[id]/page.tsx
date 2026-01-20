"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CourseEditor, CourseFormData } from "../../../../components/CourseEditor";
import { fetchCourseDetail, updateCourseDetail } from "../../../../lib/api";

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params?.id as string;
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:57',message:'handleSave called',data:{courseName:data.name,scheduleCount:data.schedule.length,officeHoursCount:data.officeHours.length,newAssignmentsCount:(data.newAssignments||[]).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion
    
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      
      const grade_weights = (data.gradeWeights || []).reduce<Record<string, number>>((acc, item) => {
        if (item.name && item.weight) {
          acc[item.name] = Number(item.weight);
        }
        return acc;
      }, {});
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:72',message:'calling updateCourseDetail',data:{courseId,gradeWeightsCount:Object.keys(grade_weights).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:89',message:'updateCourseDetail succeeded',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      setSuccessMessage("Course saved successfully!");
      
      // Reload the course data to show the updated information
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
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:113',message:'handleSave error caught',data:{errorMessage:err.message,errorName:err.name,stack:(err.stack||'').substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3,H4'})}).catch(()=>{});
      // #endregion
      console.error("Failed to save course:", err);
      setError(err.message || "Failed to save course. Please try again.");
    } finally {
      setSaving(false);
    }
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
      
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded flex items-center justify-between">
          <div>
            <strong>Success!</strong> {successMessage}
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-green-700 hover:text-green-900">
            ✕
          </button>
        </div>
      )}
      
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
        initial={initialData}
        assignments={assignments}
        onSubmit={handleSave}
        submitLabel="Save Changes"
        loading={saving}
      />
    </main>
  );
}

