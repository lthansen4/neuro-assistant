# How to Test Deferral Tracking - Step by Step

## 🔧 **The Fix Applied**

I just fixed the issue: Calendar events weren't including `linkedAssignmentId`, so deferral tracking couldn't work. 

**Now fixed:** ✅ Calendar API now sends `linkedAssignmentId` with every event

---

## ⚠️ **Important: Old Events Won't Work**

The test events you have (created before this fix) have `linkedAssignmentId = null`. 

**You need to create a NEW assignment** to test deferral tracking.

---

## 🧪 **Testing Steps**

### **Step 1: Create a New Assignment**

1. **Open the app:** http://localhost:3000
2. **Go to the calendar page**
3. **Use Quick Add** to create a new assignment:
   ```
   Math homework due Friday
   ```
4. **Wait for it to schedule** - A Focus block should appear on your calendar

---

### **Step 2: Drag the Focus Block**

1. **Find the new Focus block** on your calendar (should say "Math homework" or similar)
2. **Drag it to tomorrow**
3. **Open browser console** (F12 or right-click → Inspect → Console)
4. **Look for these logs:**
   ```
   [Calendar] Event dropped: Math homework - Focus...
   [Deferral] Tracking deferral for assignment...
   [Deferral] Moved from 2026-01-13... to 2026-01-14...
   [Deferral] Deferral 1/3 tracked
   ```

5. **Check the event** - Should now show a **"↻ 1"** badge

---

### **Step 3: Drag It Again (2nd Time)**

1. **Drag the same event to the next day**
2. **Check console:**
   ```
   [Deferral] Deferral 2/3 tracked
   [Deferral] ⚠️ Assignment has been postponed twice!
   ```
3. **Check the event** - Should now show a **"↻ 2"** badge (yellow)

---

### **Step 4: Drag It a Third Time (Wall of Awful!)**

1. **Drag the same event one more time**
2. **Check console:**
   ```
   [Deferral] Deferral 3/3 tracked
   [Deferral] 🧱 Wall of Awful detected! Assignment is stuck.
   ```
3. **MODAL SHOULD APPEAR!** 🎉

---

## 🚨 **If Nothing Happens**

### **Troubleshoot:**

1. **Check browser console for errors**
   - Press F12
   - Look for red errors

2. **Verify the event has linkedAssignmentId:**
   - In console, type:
   ```javascript
   fetch('/api/calendar/events?start=2026-01-13T00:00:00Z&end=2026-01-20T00:00:00Z', {
     headers: { 'x-clerk-user-id': 'YOUR_USER_ID' }
   }).then(r => r.json()).then(data => {
     const focusEvents = data.events.filter(e => e.extendedProps.eventType === 'Focus');
     console.log('Focus events:', focusEvents.map(e => ({
       title: e.title,
       linkedAssignmentId: e.extendedProps.linkedAssignmentId
     })));
   });
   ```

3. **If linkedAssignmentId is null:**
   - Those are old test events
   - Create a NEW assignment via Quick Add
   - Drag the NEW one

4. **If still not working:**
   - Refresh the page (Cmd+R / Ctrl+R)
   - Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
   - Check that both servers are running:
     - API: http://localhost:8787/api/adhd/health
     - Frontend: http://localhost:3000

---

## 📸 **What You Should See**

### **After 1st drag:**
```
┌─────────────────────────┐
│ Math Homework - Focus   │
│                    ↻ 1  │  ← Gray badge
└─────────────────────────┘
```

### **After 2nd drag:**
```
┌─────────────────────────┐
│ Math Homework - Focus   │
│                    ↻ 2  │  ← Yellow badge
└─────────────────────────┘
```

### **After 3rd drag:**
```
┌─────────────────────────────────────────┐
│                                         │
│  🧱 Wall of Awful Detected              │
│                                         │
│  You've postponed this 3 times          │
│                                         │
│  Let's break it into micro-tasks:       │
│  □ Open document (2 min)                │
│  □ Write thesis (10 min)                │
│  □ Write paragraph (15 min)             │
│  ...                                    │
│                                         │
│  [✨ Break it down & schedule]          │
│  [I'll handle it myself]                │
│                                         │
└─────────────────────────────────────────┘
```

---

## ✅ **Success Criteria**

You should see:
- ✅ Badge appears after each drag ("↻ 1", "↻ 2", etc.)
- ✅ Console logs show deferral tracking
- ✅ Modal appears after 3rd drag
- ✅ Modal shows micro-tasks
- ✅ Clicking "Break it down" creates 5 new assignments

---

## 🎯 **Quick Test Commands**

**Test API endpoint directly:**
```bash
USER_ID="f117b49f-54de-4bc1-b1b5-87f45b2a0503"

# Get recent assignments
curl "http://localhost:8787/api/assignments?userId=$USER_ID" | jq '.assignments[0] | {id, title}'

# Use the assignment ID to track a deferral manually
ASSIGNMENT_ID="..." # paste ID from above

curl -X POST http://localhost:8787/api/adhd/track-deferral \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"assignmentId\":\"$ASSIGNMENT_ID\",\"deferredFrom\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

---

## 📞 **Still Not Working?**

Let me know what you see:
1. What's in the browser console?
2. Does the event have a linkedAssignmentId? (Check with the JS command above)
3. Did you create a NEW assignment or trying with old test events?

**The fix is applied - you just need a fresh assignment to test with!** ✅

