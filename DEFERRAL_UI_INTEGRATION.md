# How Users "Defer" Assignments - UI Integration

## 🤔 **The Problem**

Wall of Awful detection tracks deferrals, but **how does a user actually defer something?**

Currently: API exists, but no UI triggers it.

---

## 🎯 **Natural Deferral Points (Where Users Procrastinate)**

### **1. Moving Calendar Events** ⭐ **MOST IMPORTANT**

**User Action:** Drags a Focus block to a different time/day

**Example:**
```
Monday 2 PM: "Paper - Research" (Focus block)
↓
User drags it to Tuesday 2 PM
↓
System: "This is the 2nd time you've moved this. Keep going?"
```

**How to Implement:**

```typescript
// apps/web/components/Calendar.tsx

// In the FullCalendar eventChange handler:
const handleEventChange = async (changeInfo: any) => {
  const { event, oldEvent } = changeInfo;
  
  // If event has a linked assignment, track deferral
  if (event.extendedProps?.linkedAssignmentId) {
    try {
      const response = await fetch('/api/adhd/track-deferral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          assignmentId: event.extendedProps.linkedAssignmentId,
          deferredFrom: oldEvent.start.toISOString(),
          deferredTo: event.start.toISOString(),
          reason: 'User rescheduled calendar event'
        })
      });
      
      const result = await response.json();
      
      // Show warning if now stuck
      if (result.isStuck && result.deferralCount === 3) {
        showStuckInterventionModal(event.extendedProps.linkedAssignmentId);
      }
    } catch (error) {
      console.error('Failed to track deferral:', error);
    }
  }
  
  // Update calendar event in database
  // ... existing update logic
};
```

---

### **2. Assignment List "Later" Button** ⭐

**User Action:** Clicks "Do Later" on an assignment

**Example:**
```
[ ] Math homework (due Friday)
    [Do Now] [Do Later] [Details]
           ↑ Click
```

**UI Component:**

```tsx
// apps/web/components/AssignmentCard.tsx

export function AssignmentCard({ assignment }) {
  const [deferralCount, setDeferralCount] = useState(assignment.deferralCount || 0);
  
  const handleDefer = async () => {
    try {
      const response = await fetch('/api/adhd/track-deferral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify({
          assignmentId: assignment.id,
          deferredFrom: new Date().toISOString(),
          deferredTo: null, // Unscheduled
          reason: 'User clicked "Do Later"'
        })
      });
      
      const result = await response.json();
      setDeferralCount(result.deferralCount);
      
      // Show warning after 2 deferrals, intervention at 3
      if (result.deferralCount === 2) {
        toast.warning('You\'ve postponed this twice. It might be overwhelming?');
      } else if (result.isStuck) {
        showStuckInterventionModal(assignment.id);
      }
      
    } catch (error) {
      console.error('Failed to track deferral:', error);
    }
  };
  
  return (
    <div className="assignment-card">
      <h3>{assignment.title}</h3>
      <div className="actions">
        <button onClick={handleStartNow}>Do Now</button>
        <button onClick={handleDefer}>
          Do Later {deferralCount > 0 && `(${deferralCount} times)`}
        </button>
      </div>
      
      {deferralCount >= 2 && (
        <div className="warning">
          ⚠️ You've postponed this {deferralCount} times
        </div>
      )}
    </div>
  );
}
```

---

### **3. Nudge "Remind Me Later"** 

**User Action:** Dismisses post-class nudge without adding assignment

**Example:**
```
📚 Just finished CS 101!
Any new assignments or updates?

[No updates] [Add assignment] [Remind me later]
                                      ↑ Click
```

**Integration:**

```typescript
// apps/web/components/PostClassNudgeBanner.tsx

const handleRemindLater = async () => {
  // If there's a pending assignment for this course, track deferral
  const pendingAssignments = await fetch(`/api/assignments?courseId=${nudge.courseId}&status=pending`);
  
  for (const assignment of pendingAssignments) {
    await fetch('/api/adhd/track-deferral', {
      method: 'POST',
      body: JSON.stringify({
        assignmentId: assignment.id,
        deferredFrom: new Date().toISOString(),
        deferredTo: null,
        reason: 'Dismissed post-class nudge'
      })
    });
  }
  
  dismissNudge();
};
```

---

### **4. Rebalancing Proposal Rejection**

**User Action:** Rejects a rebalancing proposal that would schedule work sooner

**Example:**
```
📊 Rebalancing Proposal
Move "Essay - Research" from Friday to Wednesday
(More urgent due date approaching)

[Apply] [Reject]
         ↑ Click
```

**Integration:**

```typescript
// apps/web/components/ProposalPanel.tsx

const handleReject = async (proposalId: string) => {
  const proposal = await fetch(`/api/rebalancing/proposal/${proposalId}`);
  
  // Track deferrals for any moves that were rejected
  for (const move of proposal.moves) {
    if (move.linkedAssignmentId) {
      await fetch('/api/adhd/track-deferral', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: move.linkedAssignmentId,
          deferredFrom: move.suggestedStartAt,
          deferredTo: move.originalStartAt, // Keeping original time
          reason: 'User rejected rebalancing proposal'
        })
      });
    }
  }
  
  // Mark proposal as rejected
  await fetch(`/api/rebalancing/proposal/${proposalId}/reject`, {
    method: 'POST'
  });
};
```

---

## 🎨 **Stuck Assignment Intervention Modal**

When `deferralCount >= 3`, show this modal:

```tsx
// apps/web/components/StuckAssignmentModal.tsx

export function StuckAssignmentModal({ assignmentId, onClose }) {
  const [assignment, setAssignment] = useState(null);
  const [microTasks, setMicroTasks] = useState([]);
  
  useEffect(() => {
    fetchAssignment();
  }, [assignmentId]);
  
  const fetchAssignment = async () => {
    const response = await fetch(`/api/assignments/${assignmentId}`);
    const data = await response.json();
    setAssignment(data);
    
    // Generate micro-tasks (could use AI here)
    setMicroTasks([
      { label: 'Open document', duration: 5, completed: false },
      { label: 'Write thesis statement', duration: 10, completed: false },
      { label: 'Write opening paragraph', duration: 15, completed: false },
      { label: 'Take a break', duration: 5, completed: false },
    ]);
  };
  
  const handleBreakIntoTasks = async () => {
    // Create micro-tasks as separate assignments or calendar events
    for (const task of microTasks) {
      await fetch('/api/quick-add/confirm', {
        method: 'POST',
        body: JSON.stringify({
          draft: {
            title: `${assignment.title}: ${task.label}`,
            estimated_duration: task.duration,
            course_id: assignment.courseId,
            category: 'Micro-task'
          }
        })
      });
    }
    
    // Reset stuck flag
    await fetch(`/api/adhd/reset-stuck/${assignmentId}`, {
      method: 'POST'
    });
    
    onClose();
  };
  
  return (
    <div className="modal stuck-intervention">
      <h2>🧱 Wall of Awful Detected</h2>
      <p>
        You've postponed <strong>{assignment?.title}</strong> {assignment?.deferralCount} times.
        <br />
        This is a sign the task feels overwhelming.
      </p>
      
      <div className="micro-tasks">
        <h3>Let's break it into tiny pieces:</h3>
        {microTasks.map((task, idx) => (
          <div key={idx} className="micro-task">
            <input type="checkbox" checked={task.completed} />
            <span>{task.label}</span>
            <span className="duration">{task.duration} min</span>
          </div>
        ))}
      </div>
      
      <div className="actions">
        <button onClick={handleBreakIntoTasks} className="primary">
          Break it down & schedule
        </button>
        <button onClick={onClose} className="secondary">
          I'll handle it myself
        </button>
      </div>
      
      <p className="encouragement">
        💪 You've got this! Starting with the smallest piece often breaks through the wall.
      </p>
    </div>
  );
}
```

---

## 🎯 **Visual Deferral Indicators**

Show deferral count throughout the UI:

### **Calendar Event Badge**

```tsx
// In Calendar.tsx eventContent renderer:
const eventContent = (eventInfo: any) => {
  const deferralCount = eventInfo.event.extendedProps?.deferralCount || 0;
  
  return (
    <div className="event-content">
      <span>{eventInfo.event.title}</span>
      {deferralCount > 0 && (
        <span className="deferral-badge" title={`Postponed ${deferralCount} times`}>
          ↻ {deferralCount}
        </span>
      )}
      {deferralCount >= 3 && (
        <span className="stuck-badge" title="This task is stuck!">
          🚨
        </span>
      )}
    </div>
  );
};
```

### **Assignment List Badge**

```tsx
// In AssignmentCard.tsx:
{assignment.isStuck && (
  <div className="stuck-warning">
    🧱 Wall of Awful - This task needs breaking down
  </div>
)}

{assignment.deferralCount >= 2 && !assignment.isStuck && (
  <div className="warning">
    ⚠️ Postponed {assignment.deferralCount} times
  </div>
)}
```

---

## 📊 **Deferral Dashboard Widget**

Show overview of stuck tasks:

```tsx
// apps/web/components/DeferralDashboard.tsx

export function DeferralDashboard() {
  const [stuckAssignments, setStuckAssignments] = useState([]);
  const [atRiskAssignments, setAtRiskAssignments] = useState([]);
  
  useEffect(() => {
    fetchStuckAssignments();
  }, []);
  
  const fetchStuckAssignments = async () => {
    const response = await fetch('/api/adhd/stuck-assignments?userId=' + userId);
    const data = await response.json();
    
    setStuckAssignments(data.stuck);
    
    // Also fetch assignments with 2 deferrals (at risk)
    const allAssignments = await fetch('/api/assignments?userId=' + userId);
    const assignments = await allAssignments.json();
    setAtRiskAssignments(
      assignments.assignments.filter(a => a.deferralCount === 2)
    );
  };
  
  return (
    <div className="deferral-dashboard">
      {stuckAssignments.length > 0 && (
        <div className="stuck-section">
          <h3>🧱 Stuck Tasks ({stuckAssignments.length})</h3>
          <p>These tasks need breaking down into smaller pieces:</p>
          {stuckAssignments.map(assignment => (
            <div key={assignment.id} className="stuck-item">
              <span>{assignment.title}</span>
              <button onClick={() => showStuckModal(assignment.id)}>
                Break Down
              </button>
            </div>
          ))}
        </div>
      )}
      
      {atRiskAssignments.length > 0 && (
        <div className="at-risk-section">
          <h3>⚠️ At Risk ({atRiskAssignments.length})</h3>
          <p>Postponed twice - one more and they'll be stuck:</p>
          {atRiskAssignments.map(assignment => (
            <div key={assignment.id} className="at-risk-item">
              <span>{assignment.title}</span>
              <span className="deferral-count">↻ 2</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## ✅ **Implementation Priority**

**Implement these in order:**

1. **Calendar Event Dragging** ⭐⭐⭐ (HIGHEST PRIORITY)
   - Most natural deferral point
   - Already have UI (FullCalendar)
   - Just need to hook into `eventChange` handler

2. **Assignment List "Do Later" Button** ⭐⭐
   - Explicit deferral action
   - Easy to understand for users

3. **Stuck Assignment Modal** ⭐⭐
   - Show when `deferralCount >= 3`
   - Critical for Wall of Awful intervention

4. **Visual Indicators** ⭐
   - Badges on calendar events
   - Warning on assignment cards

5. **Deferral Dashboard** ⭐
   - Overview widget
   - Shows all stuck/at-risk tasks

6. **Nudge "Remind Me Later"** (Optional)
   - Less common than calendar dragging

7. **Rebalancing Rejection** (Optional)
   - Advanced feature

---

## 🚀 **Quick Win: Start with Calendar Dragging**

This single integration will capture **90% of deferrals**:

```typescript
// apps/web/components/Calendar.tsx

// Find the eventChange handler and add deferral tracking
eventChange: async (changeInfo) => {
  const { event, oldEvent } = changeInfo;
  
  // Track deferral if event has linked assignment
  if (event.extendedProps?.linkedAssignmentId) {
    const response = await fetch('/api/adhd/track-deferral', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({
        assignmentId: event.extendedProps.linkedAssignmentId,
        deferredFrom: oldEvent.start.toISOString(),
        deferredTo: event.start.toISOString(),
        reason: 'Rescheduled on calendar'
      })
    });
    
    const result = await response.json();
    
    // Show intervention modal if stuck
    if (result.isStuck) {
      setStuckModalOpen(true);
      setStuckAssignmentId(event.extendedProps.linkedAssignmentId);
    } else if (result.deferralCount === 2) {
      toast.warning('You\'ve moved this twice. Feeling stuck?');
    }
  }
  
  // Update event in database (existing logic)
  // ...
}
```

**Want me to implement this integration in the Calendar component now?** 🎯







