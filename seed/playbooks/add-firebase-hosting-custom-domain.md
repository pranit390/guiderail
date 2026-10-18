---
id: add-firebase-hosting-custom-domain
appliesTo: ["console.firebase.google.com/*"]
goals: ["custom domain", "firebase hosting domain", "connect domain"]
---

# Adding a Firebase Hosting custom domain

Stop before Verify: DNS changes are the user's call. Source: https://firebase.google.com/docs/hosting/custom-domain

1. In the Firebase console, the user picks the project, then opens Hosting under Build.
2. Click "Add custom domain".
3. The user types the domain they own. Guide never types it.
4. Show the DNS records Firebase lists and explain they go to the domain registrar.
5. Stop here. The user decides when to add the records and click Verify.

## Quirks

- DNS changes can take up to 24 hours to take effect.
