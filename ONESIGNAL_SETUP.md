# OneSignal Push Notifications Setup Guide

## ✅ What's Already Done

All the code is ready! Now you just need to configure OneSignal.

---

## 🚀 Setup Steps (5 minutes)

### 1. Create OneSignal Account
1. Go to **https://onesignal.com**
2. Sign up for a free account
3. Click **"New App/Website"**

### 2. Configure Web Push
1. Choose **"Web Push"**
2. Select **"Typical Site"** (not WordPress)
3. **Site URL:** `http://localhost:3000` (for development)
   - For production, use your actual domain
4. Click **"Save"**

### 3. Get Your Credentials
After setup, you'll see:
- **App ID** - looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **REST API Key** - in Settings → Keys & IDs

### 4. Add to Environment Variables

Create/edit these files:

**`apps/web/.env.local`:**
```env
NEXT_PUBLIC_ONESIGNAL_APP_ID=your_app_id_here
```

**`apps/api/.env`:**
```env
ONESIGNAL_REST_API_KEY=your_rest_api_key_here
NEXT_PUBLIC_ONESIGNAL_APP_ID=your_app_id_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Restart Servers
```bash
# Kill and restart both servers
npm run dev -w @neuro/web
npm run dev -w @neuro/api
```

---

## 🧪 Testing

### Test 1: Browser Permission
1. Open the app at http://localhost:3000
2. Open browser console (F12)
3. Look for: `[OneSignal] Initialized successfully`
4. Browser should prompt for notification permission
5. Click **"Allow"**

### Test 2: Manual Test Notification
I can add a test button to send yourself a push notification to verify it's working!

### Test 3: Post-Class Nudge
1. Wait for a class to end (or create a test nudge via script)
2. You should receive a push notification even if browser is minimized!
3. Click notification → Opens app to nudge banner

---

## 📱 What Happens Now

When a class ends:
1. ✅ Cron job detects ended class
2. ✅ Creates nudge in database
3. ✅ **Sends push notification via OneSignal** 🆕
4. ✅ Shows "Update CS101?" notification
5. ✅ User clicks → Opens app → Sees banner

---

## 🐛 Troubleshooting

**"OneSignal not initialized"**
- Check that App ID is in `.env.local`
- Restart the frontend server

**"No notification appears"**
- Check browser notification permissions
- Check browser console for errors
- Try in Chrome/Edge (best support)

**"Push sent but not received"**
- Wait 30 seconds (OneSignal can be delayed)
- Check OneSignal dashboard → Delivery Logs
- Make sure external_user_id is set (check console)

---

## 🎯 Next Steps

1. Get your OneSignal credentials
2. Add to `.env.local` and `.env`
3. Restart servers
4. Test!

**Let me know when you have your credentials and I'll help you test!** 🚀




