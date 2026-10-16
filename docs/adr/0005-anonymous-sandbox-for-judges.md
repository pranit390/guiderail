# Judges get a silent anonymous sign-in and a private sandbox org

Everyone is signed in with Firebase Anonymous Auth and gets their own copy of the seed org (`orgs/sbx-{uid}`, deleted after 7 days by a TTL), with admin rights inside it. Google sign-in is offered only to join a real org. We don't know who will test the app, so a login wall or shared demo credentials would both hurt. Per-user sandboxes stop one judge from breaking the demo for the next. Abuse and cost are limited by App Check (reCAPTCHA Enterprise), per-user limits on `/live`, a 10-minute session cap and a budget alert.
