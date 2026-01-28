import { db, schema } from './db';
import { eq, and } from 'drizzle-orm';

/**
 * Converts a percentage grade to a letter grade using standard scale
 */
export function percentageToLetterGrade(percentage: number): string {
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';
  return 'F';
}

/**
 * Calculates the weighted average grade for a course based on graded assignments
 * Returns null if no graded assignments exist
 */
export async function calculateCourseGrade(courseId: string): Promise<{
  percentage: number | null;
  letterGrade: string | null;
  breakdown: {
    category: string;
    weight: number;
    average: number;
    assignmentCount: number;
  }[];
} | null> {
  // Get course with grade weights
  const course = await db.query.courses.findFirst({
    where: eq(schema.courses.id, courseId)
  });

  if (!course) {
    throw new Error('Course not found');
  }

  // Get all graded assignments for this course
  const gradedAssignments = await db.query.assignments.findMany({
    where: and(
      eq(schema.assignments.courseId, courseId),
      eq(schema.assignments.graded, true)
    )
  });

  if (gradedAssignments.length === 0) {
    return null; // No grades to calculate
  }

  // Parse grade weights from syllabus
  const gradeWeights = (course.gradeWeightsJson as Record<string, number>) || {};
  const hasWeights = Object.keys(gradeWeights).length > 0;

  // Group assignments by category and calculate averages
  const categoryStats: Map<string, { totalEarned: number; totalPossible: number; count: number }> = new Map();

  for (const assignment of gradedAssignments) {
    const category = assignment.category || 'Uncategorized';
    const earned = Number(assignment.pointsEarned || 0);
    const possible = Number(assignment.pointsPossible || 1);

    if (!categoryStats.has(category)) {
      categoryStats.set(category, { totalEarned: 0, totalPossible: 0, count: 0 });
    }

    const stats = categoryStats.get(category)!;
    stats.totalEarned += earned;
    stats.totalPossible += possible;
    stats.count += 1;
  }

  // Calculate category averages
  const categoryAverages: { category: string; average: number; count: number }[] = [];
  for (const [category, stats] of categoryStats.entries()) {
    if (stats.totalPossible > 0) {
      const average = (stats.totalEarned / stats.totalPossible) * 100;
      categoryAverages.push({ category, average, count: stats.count });
    }
  }

  if (categoryAverages.length === 0) {
    return null; // No valid grades
  }

  let overallGrade: number;
  const breakdown: { category: string; weight: number; average: number; assignmentCount: number }[] = [];

  if (hasWeights) {
    // Use syllabus weights
    let weightedSum = 0;
    let totalWeightUsed = 0;
    const unmatchedCategories: { category: string; average: number; count: number }[] = [];

    // First pass: match categories to weights
    for (const { category, average, count } of categoryAverages) {
      // Try to find matching weight (case-insensitive, partial match)
      const matchingWeightKey = Object.keys(gradeWeights).find(
        key => key.toLowerCase().includes(category.toLowerCase()) || 
               category.toLowerCase().includes(key.toLowerCase())
      );

      if (matchingWeightKey) {
        const weight = gradeWeights[matchingWeightKey] / 100; // Convert to decimal
        weightedSum += average * weight;
        totalWeightUsed += weight;
        breakdown.push({
          category,
          weight: gradeWeights[matchingWeightKey],
          average,
          assignmentCount: count
        });
      } else {
        unmatchedCategories.push({ category, average, count });
      }
    }

    // Second pass: distribute remaining weight to unmatched categories
    if (unmatchedCategories.length > 0) {
      const remainingWeight = 1 - totalWeightUsed;
      const weightPerUnmatched = remainingWeight / unmatchedCategories.length;

      for (const { category, average, count } of unmatchedCategories) {
        weightedSum += average * weightPerUnmatched;
        breakdown.push({
          category,
          weight: weightPerUnmatched * 100,
          average,
          assignmentCount: count
        });
      }
      totalWeightUsed = 1;
    }

    // Calculate final grade (normalize by total weight used)
    overallGrade = totalWeightUsed > 0 ? weightedSum / totalWeightUsed : 0;
  } else {
    // No weights: treat all categories equally
    const equalWeight = 100 / categoryAverages.length;
    let sum = 0;

    for (const { category, average, count } of categoryAverages) {
      sum += average;
      breakdown.push({
        category,
        weight: equalWeight,
        average,
        assignmentCount: count
      });
    }

    overallGrade = sum / categoryAverages.length;
  }

  return {
    percentage: Math.round(overallGrade * 10) / 10, // Round to 1 decimal
    letterGrade: percentageToLetterGrade(overallGrade),
    breakdown
  };
}

/**
 * Updates the course's current_grade and grade_updated_at fields
 */
export async function updateCourseGrade(courseId: string): Promise<void> {
  const gradeResult = await calculateCourseGrade(courseId);

  if (gradeResult === null) {
    // No grades yet - clear the current grade
    await db
      .update(schema.courses)
      .set({
        currentGrade: null,
        gradeUpdatedAt: new Date()
      })
      .where(eq(schema.courses.id, courseId));
  } else {
    // Update with calculated grade
    await db
      .update(schema.courses)
      .set({
        currentGrade: gradeResult.percentage?.toString() || null,
        gradeUpdatedAt: new Date()
      })
      .where(eq(schema.courses.id, courseId));
  }
}

