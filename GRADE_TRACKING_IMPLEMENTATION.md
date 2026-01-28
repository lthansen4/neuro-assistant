# Grade Entry & Tracking Feature - Implementation Summary

## Overview
Implemented a complete grade tracking system that allows students to enter grades for assignments and automatically calculates weighted course grades based on syllabus-defined grade weights.

## Features Implemented

### 1. Grade Calculation Service (`apps/api/src/lib/grade-calculator.ts`)
- **`percentageToLetterGrade()`** - Converts percentage (0-100) to letter grade (A, A-, B+, etc.)
- **`calculateCourseGrade()`** - Calculates weighted average from graded assignments
  - Groups assignments by category
  - Applies syllabus weights from `grade_weights_json`
  - Handles unweighted categories by distributing remaining weight equally
  - Returns percentage, letter grade, and detailed breakdown
- **`updateCourseGrade()`** - Updates course's `current_grade` and `grade_updated_at` fields

### 2. Backend API Endpoints

#### `PATCH /api/assignments/:id/grade`
Updates grade fields for a specific assignment and triggers course grade recalculation.

**Request Body:**
```json
{
  "pointsEarned": 85,
  "pointsPossible": 100,
  "graded": true
}
```

**Response:**
```json
{
  "ok": true,
  "assignment": {
    "id": "...",
    "pointsEarned": "85",
    "pointsPossible": "100",
    "graded": true,
    "submittedAt": "2026-01-28T..."
  },
  "courseGrade": {
    "percentage": 87.5,
    "letterGrade": "B+"
  }
}
```

#### `GET /api/courses` (Updated)
Now includes calculated letter grades for each course.

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": "...",
      "name": "Psychology 101",
      "currentGrade": 87.5,
      "letterGrade": "B+",
      "gradeUpdatedAt": "2026-01-28T..."
    }
  ]
}
```

### 3. Frontend: Assignment Edit Modal
Added grade entry fields in the assignment edit modal after the "Effort (minutes)" field.

**Features:**
- Two input fields: Points earned / Points possible
- Real-time percentage calculation display
- Saves grade separately via PATCH endpoint
- Shows toast notification with updated course grade
- Optional - only appears when user enters values

### 4. Frontend: Courses Page
Updated courses overview page to display grades for each course.

**Display:**
- Letter grade (large, prominent) - e.g., "B+"
- Percentage (small, below letter) - e.g., "87.5%"
- "No grades yet" message if no graded assignments

## Grade Calculation Logic

### Letter Grade Scale
```
A:  93-100
A-: 90-92.99
B+: 87-89.99
B:  83-86.99
B-: 80-82.99
C+: 77-79.99
C:  73-76.99
C-: 70-72.99
D+: 67-69.99
D:  63-66.99
D-: 60-62.99
F:  0-59.99
```

### Weighted Average Calculation

1. **Filter**: Only include assignments where `graded = true`
2. **Group**: Group assignments by `category` field
3. **Calculate category averages**: `sum(points_earned) / sum(points_possible) * 100`
4. **Apply weights**: Use syllabus `grade_weights_json` to weight each category
5. **Handle mismatches**: Distribute remaining weight equally to unmatched categories
6. **No weights**: If syllabus has no weights, treat all categories equally

**Example:**
```
Syllabus weights: {"Homework": 30, "Exams": 40, "Final": 30}
Graded assignments:
- Homework 1: 85/100 (85%)
- Homework 2: 90/100 (90%)
- Exam 1: 88/100 (88%)

Calculation:
- Homework average: (85+90)/(100+100) = 87.5%
- Exams average: 88/100 = 88%
- Final: Not graded yet

Current grade = (87.5 * 0.30 + 88 * 0.40) / 0.70 = 88.1% = B+
```

## Database Schema (No Changes Required)

All necessary fields already exist from migration 0022:

**assignments table:**
- `graded` (boolean) - marks if assignment has been graded
- `points_earned` (numeric 10,2) - actual points received
- `points_possible` (numeric 10,2) - max points possible
- `weight_override` (numeric 5,2) - manual weight override (not used yet)

**courses table:**
- `grade_weights_json` (jsonb) - category weights from syllabus
- `current_grade` (numeric 5,2) - calculated percentage grade (0-100)
- `grade_updated_at` (timestamp) - last calculation time

## User Experience Flow

1. Student completes assignment
2. Student receives grade from professor
3. Student opens assignment in edit modal
4. Student enters: `85 / 100`
5. Modal shows: "Grade: 85.0%"
6. Student clicks "Save Changes"
7. System calculates weighted course grade
8. Toast shows: "Assignment saved! Course grade: 87.5% (B+)"
9. Courses page updates to show new grade

## Testing Recommendations

- [ ] Enter grade in assignment edit modal
- [ ] Verify course grade updates automatically
- [ ] Check letter grade matches percentage
- [ ] Test with multiple assignments in same category
- [ ] Test with missing syllabus weights (should treat equally)
- [ ] Verify only graded assignments count in calculation
- [ ] Test edge cases: 0 points, perfect score, decimals
- [ ] Test category mismatch (assignment category not in weights)

## Files Modified

1. **NEW**: `apps/api/src/lib/grade-calculator.ts` - Grade calculation service
2. **MODIFIED**: `apps/api/src/routes/assignments.ts` - Added PATCH /grade endpoint
3. **MODIFIED**: `apps/api/src/routes/courses.ts` - Updated GET / to include grades
4. **MODIFIED**: `apps/web/components/AssignmentEditModal.tsx` - Added grade entry UI
5. **MODIFIED**: `apps/web/app/(protected)/courses/page.tsx` - Added grade display

## Next Steps (Future Enhancements)

- Grade forecast: "What grade do I need on the final to get an A?"
- Grade breakdown modal: Show detailed category breakdown
- Grade history: Track grade changes over time
- GPA calculator: Calculate overall GPA across all courses
- Grade notifications: Alert when grade drops below threshold

