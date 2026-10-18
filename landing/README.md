# GuideRail landing page

Static site for the public GuideRail page. Firebase Hosting can serve the built files. This directory has its own `package.json` and is not in the root npm workspaces, so installing or building the page alone leaves the server and the extension alone.

The page is the Follow the rail concept with the Rail check logo. The primary button downloads the Chrome extension. The extension zip is produced at build time and is not committed.

## One command

From the repository root, with dependencies installed:

```sh
npm ci
npm ci --prefix landing
npm run build:site
```

`npm run build:site` does three things:

1. Clears `extension/dist`, then builds the extension with `GUIDERAIL_SERVER_URL` set to the hosted coach origin in `src/content/coach.json` and `GUIDERAIL_BUILD_REVISION` set to the current commit.
2. Builds this Astro site into `landing/dist/`.
3. Zips the contents of `extension/dist` as `guiderail-extension/` and writes `landing/dist/download/guiderail-extension.zip`.

Unzip the archive and load the `guiderail-extension` folder, which contains `manifest.json`, with Chrome's Load unpacked. `dist/` is gitignored, so the zip is not committed. Run the same command again to rebuild it.

Build the release zip only from `develop`, after the Assist Database ID fill has merged there, because the page describes that fill. The release zip is built at deploy time from `develop`, not from a feature branch.

Node 22.22 or newer, and `python3` on PATH for the zip step.

## Preview

```sh
npm run preview --prefix landing
```

`npm run dev --prefix landing` serves the page on 127.0.0.1 without the zip. The download button targets `/download/guiderail-extension.zip`, which exists after `npm run build:site`.

## Hosting config

`firebase.json` and `.firebaserc` at the repository root target site `guiderail` in project `zoop-innovation`, with `landing/dist` as the public directory. Do not deploy. The captain reviews the page before anything is published to https://guiderail.web.app.

## What the page shows

The flagship story is Create a Firestore database on the Firebase console: Goal, cited Steps, a Rules check, then Done. Green is the way forward, yellow asks for a check, and red is a Violation.

The form under that story is an illustration. It does not call the coach, and it does not create a database. Guide outlines Database ID. Assist proposes `demo-guide` and fills it only after approval. Test mode is a Violation. You click Create.

The install list under the download button is Load unpacked: unzip, `chrome://extensions`, Developer mode, Load unpacked, pin GuideRail, open the Firebase console. A link beside it opens the labelled practice pages on the hosted coach.
