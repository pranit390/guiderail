# GuideRail landing page

Static site for the public GuideRail page. Firebase Hosting can serve the built files. This directory has its own `package.json` and is not in the root npm workspaces, so installing or building the page alone leaves the server and the extension alone.

The page is the Follow the rail concept with the Rail check logo. The primary button downloads the Chrome extension from the hosted coach:

`https://guiderail-coach-q7tihot5sq-uc.a.run.app/download/guiderail-extension.zip`

That zip is produced by the coach deploy, which includes the Firebase sign-in key. This landing build does not produce it. Judges sign in with the demo login provided with the judging packet. Install is still Load unpacked.

## One command

From the repository root, with dependencies installed:

```sh
npm ci
npm ci --prefix landing
npm run build:site
```

`npm run build:site` builds this Astro site into `landing/dist/`. It does not build or zip the extension.

`npm run package:extension-zip` is an opt-in local script. It writes `dist/guiderail-extension.zip` at the repository root, outside the Hosting public directory, and is not what the page links to. A zip from that script does not include the Firebase sign-in key. It needs `python3` on PATH.

Node 22.22 or newer.

## Preview

```sh
npm run preview --prefix landing
```

`npm run dev --prefix landing` serves the page on 127.0.0.1. The download button targets the hosted coach zip.

## Hosting config

`firebase.json` and `.firebaserc` at the repository root target site `guiderail` in project `zoop-innovation`, with `landing/dist` as the public directory. Do not deploy. The captain reviews the page before anything is published to https://guiderail.web.app.

## What the page shows

The flagship story is Create a Firestore database on the Firebase console: Goal, cited Steps, a Rules check, then Done. Green is the way forward, yellow asks for a check, and red is a Violation.

The form under that story is an illustration. It does not call the coach, and it does not create a database. Guide outlines Database ID. Assist proposes `demo-guide` and fills it only after approval. Test mode is a Violation. You click Create.

The install list under the download button comes from `installSteps` in `src/content/guiderail.ts`: Load unpacked, then how to open GuideRail and sign in. A link beside it opens the labelled practice pages on the hosted coach.
