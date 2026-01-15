# Neuro-Assistant Backlog: Specialized Academic Assistant

This document outlines the feature-level requirements, user stories, and technical specifications for the next phase of development. The app is a neuro-adaptive executive function assistant for a neurodivergent freshman in college.

---

## 🏗️ EPIC 1: Mobile-First UX & Design System
*Foundation for a calming, responsive experience that minimizes cognitive load.*

### 1.1 Mobile App Redesign
**Priority:** Must Have  
**Categories:** UI/UX  

**User Story:**  
As a **student user**, I want **a redesigned mobile application interface** so that **I can efficiently manage my academic tasks with an intuitive, modern, and responsive experience that works seamlessly on my mobile device**.

**Acceptance Criteria:**
- Web app has mobile-first displays for iPhone 12+ and modern Android browsers.
- Core functionality (Quick Add, Calendar, Timers) accessible in ≤ 3 taps.
- Touch targets are minimum 44x44 pixels (iOS) / 48x48dp (Android).
- App responds within 200ms for visual feedback.
- Supports portrait orientation.

**Technical Requirements:**
- **Framework:** Next.js 14 (App Router), Tailwind CSS.
- **Components:** Shadcn UI (Radix UI).
- **Breakpoints:** sm: 640px, md: 768px, lg: 1024px.

---

### 1.2 App UI (Branding & Design System)
**Priority:** Could Have  
**Categories:** UI/UX  

**User Story:**  
As a **student user**, I want **a visually cohesive and branded app interface** so that **the app feels polished, professional, and enjoyable to use every day**.

**Acceptance Criteria:**
- Documented color palette (Primary: Indigo/Blue for Focus, Secondary: Green/Teal for Chill).
- Typography: Inter (Sans-serif) for high readability.
- Consistent iconography using `lucide-react`.
- WCAG AA accessibility compliance.

---

## 🧠 EPIC 2: Context & Information Enrichment
*Enhancing data visibility and reducing the need for the user to remember details.*

### 2.1 Descriptions in Cards
**Priority:** Must Have  
**Categories:** New Feature, UI/UX, User Interaction Improvement  

**User Story:**  
As a **student user**, I want **to see my previously entered information and AI-generated details when I click on a calendar event** so that **I have quick access to all context without needing to remember or search for information I've already provided**.

**Acceptance Criteria:**
- Tapping any calendar event opens a detail view.
- Displays AI quick-add question/responses (if applicable).
- Displays student's manual description.
- Shows core metadata: Title, Class, Due Date, Duration.

**Technical Requirements:**
- **Data Model:** `assignments.metadata->'ai_context'` and `assignments.description`.

---

### 2.2 Edit Parent Card & Linked Navigation
**Priority:** Must Have  
**Categories:** Enhancement, User Interaction Improvement, Feature Addition  

**User Story:**  
As a **student user**, I want **the ability to edit card details and navigate between assignments and their scheduled work blocks** so that **I can update information as things change and see exactly when I've planned to complete specific tasks**.

**Acceptance Criteria:**
- **Editing:** User can edit Description, Title, Course, and Due Date from the detail view.
- **Navigation:** Clicking on a "due date" or "assignment" card (the "parent") allows the user to see and navigate to all linked focus blocks.
- For example, if a Math HW has 2 scheduled blocks, clicking the "Due Date" card on Friday highlights those blocks on the calendar.
- Option to cancel edits and revert to previous state.

**Technical Requirements:**
- **Data Model:** Links `assignments` to `calendar_events_new` via `assignment_id`.
- **Navigation:** Deep link to specific calendar dates.

---

## 📚 EPIC 3: Specialized Academic Views
*Categorized lists to help students plan effort without getting lost in a full calendar.*

### 3.1 Reading View & Interactive Prompts
**Priority:** Should Have  
**Categories:** Feature Addition, New Functionality, UI/UX  

**User Story:**  
As a **student user**, I want **a dedicated view for reading assignments and prompts to track my progress** so that **I can plan my reading, log my progress, and capture questions for class while they are fresh**.

**Acceptance Criteria:**
- **Grouping:** Group readings by Today, Tomorrow, This Week, and This Month.
- **Progress Prompt:** When a student ends a "Locked In" session or exits a reading card, prompt: "How many pages did you read?"
- **Question Capture:** Prompt: "Do you have any questions for the professor or study group?"
- **Auto-Schedule:** If incomplete, prompt the student to schedule the remaining pages before the due date based on available time.

**Technical Requirements:**
- **Filtering:** `assignments` where `category = 'Reading'`.
- **Data Model:** Track `pages_completed` and `total_pages`.

---

### 3.2 Homework & Test Views
**Priority:** Should Have  
**Categories:** Feature Addition, User Interaction Improvement, New Functionality  

**User Story:**  
As a **student user**, I want **dedicated views for homework and tests** so that **I can prioritize my study effort and avoid last-minute cramming**.

**Acceptance Criteria:**
- **Homework View:** Grouped by Today, Tomorrow, This Week, Next Week. Red indicator for overdue.
- **Test View:** High salience view showing tests by date. Highlights "Days Remaining" prominently.
- Tapping a card jumps to the associated study blocks on the calendar.

---

## ⏱️ EPIC 4: Focus & Recovery Timers
*The core work-rest cycle powered by the "Locked In" and "Chill" mechanics.*

### 4.1 "Locked In" Focus Timer
**Priority:** Must Have  
**Categories:** User Task Management, New Functionality, User Interaction Improvement  

**User Story:**  
As a **student user**, I want **a "locked in" focus timer that tracks my session and prompts for accomplishments** so that **I can maintain focus and keep a record of my progress**.

**Acceptance Criteria:**
- **Auto-populate:** Timer duration fills with the next scheduled focus block or until the end of the day/next class.
- **Countdown:** Displays remaining time clearly.
- **Accomplishment Prompt:** When stopped/completed, ask: "What did you accomplish?"
- Show checkboxes for events scheduled during that period first.

---

### 4.2 "Chill" Recovery Timer
**Priority:** Must Have  
**Categories:** User Task Management, New Functionality, User Interaction Improvement  

**User Story:**  
As a **student user**, I want **to earn "Chill Time" for my hard work** so that **I can rest guilt-free without over-indulging**.

**Acceptance Criteria:**
- **Ratio:** 1 minute of chill time earned for every **3 minutes** of "locked in" focus time.
- **Accumulation:** Chill time accumulates in a bank and persists.
- **Usage:** Student can use the chill timer for any amount up to the available total.
- **Persistence:** State persists if the app is closed.

---

## 🎓 EPIC 5: Student Profile & Performance
*Customizing the experience and tracking academic health.*

### 5.1 Student Information & Profile
**Priority:** Must Have  
**Categories:** Feature Addition, User Interaction Improvement, New Functionality  

**User Story:**  
As a **student user**, I want **a centralized profile for my academic info and preferences** so that **the app can provide personalized recommendations and the AI has relevant context**.

**Acceptance Criteria:**
- **Fields:** Name, Major, Minor, Year, Graduation Date, Current GPA.
- **Preferences:** Strengths, Weaknesses, and scheduling preferences (e.g., "Avoid late nights").

---

### 5.2 Class View & Grade Tracking
**Priority:** Should Have  
**Categories:** Feature Addition, User Interaction Improvement, New Functionality  

**User Story:**  
As a **student user**, I want **to see all info for a class in one place and track my grades** so that **I can see my academic progress and forecasted final grade**.

**Acceptance Criteria:**
- **Class View:** Non-calendar info: Professor name, office hours, syllabus.
- **Grade Entry:** Add Grade and optional reasoning to assignment/test cards.
- **Grade Forecasting:** Calculate an ESTIMATED final grade using syllabus weights stored in the DB.
- **Disclaimer:** "This is an ESTIMATE. Please verify with your professor during office hours."
- **OCR (Nice to have):** Future ability to take a photo of a graded paper/comments to ingest grade and feedback.

**Technical Requirements:**
- Uses `courses.grade_weights_json` for calculations.
- **Database:** Supabase/PostgreSQL.

---

## 📝 EPIC 6: Lightweight Capture
*Reducing friction for capturing non-academic thoughts.*

### 6.1 Quick Add Notes (Inbox replacement)
**Priority:** Could Have  
**Categories:** New Feature, User Interaction Improvement, Feature Addition  

**User Story:**  
As a **student user**, I want **a place to quickly capture notes that aren't formal assignments** so that **I don't lose track of small tasks like 'Send notes to Sasha'**.

**Acceptance Criteria:**
- Generic capture field for non-academic notes.
- Option to categorize by class or "General" later.
- Accessible via global quick-add input.

---

## 🤖 EPIC 7: AI Optimization
*Refining the existing intelligence to ensure it is helpful, not a burden.*

### 7.1 Improved AI Responses
**Priority:** Must Have  
**Categories:** Enhancement, Performance Improvement, New Functionality  

**User Story:**  
As a **student user**, I want **optimized AI responses that are accurate and contextually relevant** so that **I don't have to manually correct what the AI suggests**.

**Acceptance Criteria:**
- AI incorporates schedule and assignment metadata more accurately.
- Response time under 3 seconds.
- Results are properly formatted in the UI.

**Technical Requirements:**
- **Provider:** OpenAI GPT-4o-mini.
- **Prompt Engineering:** Optimized templates for current Quick Add and Syllabus parsing.

---

## 🗺️ DEPENDENCY-AWARE DEVELOPMENT ORDER

1. **Epic 1: Mobile-First UX & Foundation**  
   *Essential for all new screens and features.*
2. **Epic 2: Card Details & Editing**  
   *Expands the utility of existing assignments and provides the navigation patterns for later views.*
3. **Epic 3: Specialized Academic Views (Reading/HW/Tests)**  
   *Builds the organizational value for the student.*
4. **Epic 5.1: Student Profile**  
   *Small but necessary for personalizing the experience.*
5. **Epic 4: Focus & Chill Timers**  
   *The core interactive "game loop" of the app.*
6. **Epic 5.2: Grades & Forecasting**  
   *Adds the high-value performance tracking once data entry is stable.*
7. **Epic 6: Lightweight Capture**  
   *Completes the "everything in one place" goal.*
8. **Epic 7: AI Optimization**  
   *Iterative improvement of the current system.*

---

## ⚠️ NOTABLE UPDATES
- **Chill Ratio updated to 1:3** (from 2.5). Dashboard and DB defaults need alignment.
- **OCR** is marked as a "Nice to Have" but scoped for feedback ingestion.
- **Disclaimer** required on all grade forecasts: "ESTIMATE - verify with office hours."

---

## 📅 SPRINT BREAKDOWN (Chunked Delivery)

### Sprint 1: Foundation UI
- UI tokens + mobile web layout patterns.
- Mobile navigation and core screen responsiveness.
- Base card detail sheet (read-only).

### Sprint 2: Card Details + Edit
- Card detail includes AI context + description (Epic 2.1).
- Edit flow for description on parent cards (Epic 2.2).
- Shared “due date chip” pattern wired to detail view.

### Sprint 3: Reading Slice
- Reading view grouped by due windows (Epic 3.1).
- Reading card progress prompts (pages read + questions).
- Completion/incomplete prompt with scheduling suggestion.

### Sprint 4: Homework + Test Slice
- Homework view grouped by due windows (Epic 3.2).
- Upcoming test view with urgency highlighting.
- Reuse list grouping + detail sheet; add test-specific chips.

### Sprint 5: Due-Date Navigation + Class View
- Due-date chip navigation to focus blocks on calendar (Epic 2.3).
- Class view summary (metadata + assignments/readings/tests lists) (Epic 5.2).

### Sprint 6: Quick Add Notes
- Notes capture UI (replace inbox) (Epic 6.1).
- Notes tagging (class/general) and conversion to assignment/task.

### Sprint 7: Locked-In + Chill Timers
- Locked-in timer auto-populates next focus block (Epic 4.1).
- Chill bank tracking + partial usage (Epic 4.2).
- Stop flow: accomplishment prompt and quick check-off.

### Sprint 8: Grades On Assignments/Tests
- Grade input + notes on detail/edit views (Epic 5.2).
- Persistence + retrieval for forecasting.

### Sprint 9: AI Prompt Improvements
- Prompt versioning + output schema consistency (Epic 7.1).
- Parse confidence instrumentation and logging.

