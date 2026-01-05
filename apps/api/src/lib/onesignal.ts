export async function sendPush(title: string, body: string, externalUserId: string) {
  await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
      include_external_user_ids: [externalUserId],
      headings: { en: title },
      contents: { en: body }
    })
  });
}
