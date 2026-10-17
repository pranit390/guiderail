# GuideRail landing page

Static site for the GuideRail public page. It is the first page on a small kit the team can reuse for other products. This directory has its own `package.json` and is not in the root npm workspaces, so installing or building it leaves the server and the extension alone.

## Run

Node 22.22 or newer.

```sh
cd landing
npm install
npm run dev
```

`npm run dev` serves the site on 127.0.0.1. The terminal prints the port.

```sh
npm run build
npm run preview
```

`npm run build` writes the static files to `dist/`. `npm run preview` serves that folder.

## Placeholder link

`src/content/guiderail.ts` exports `cta`. Every button reads `cta.label` and `cta.href`. The URL is a placeholder until the install or demo address exists. Leave `cta.placeholder` true until you replace `cta.href`, so the page keeps the note that the address is not live.

## Deploy later

Do not deploy from this change. When you choose to publish, use the files in `dist/` after `npm run build`.

### Firebase Hosting

From this directory, point Hosting at the build output:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

`firebase deploy --only hosting` publishes that folder. Run it only when you mean to publish.

### Cloud Run

Build `dist/` and serve those files from a static server in a container. One approach is an nginx image that copies `dist/` into the default html directory and listens on the port Cloud Run sets. `gcloud run deploy` publishes that image. Run it only when you mean to publish. This directory has no container and no deploy script.

## Kit

- `src/styles/global.css` holds color, type, space, and motion tokens on `:root`.
- `src/kit/types.ts` is the content shape. Name, audience, positioning, one call to action, rail stops, and FAQ.
- `src/components/RailList.astro` and `src/components/FaqList.astro` render that content.
- `src/scripts/hero.ts` is the one Motion interaction. It draws an SVG rail when the visitor asks to see the Step. If `prefers-reduced-motion` is set, the rail appears in place and the captions still read in full.

A later product adds a content module and a page. Skip a 3D scene unless a flat diagram cannot explain that product. Put only claims the product can actually do in the content module.

## What the page shows

The plate is a drawing of the Cloud Run Services list. The visitor asks to see a Step, opens Labels, reads the Org Labeling Policy, enters a value, and sees a Violation resolved by a corrective Step. The caption list under the plate tells the same story with JavaScript off. The page does not ask for a microphone or a Google account, and it does not type into the field by itself.

The first Save during a Violation is held and named. A second click continues anyway. An Approver status is a record on the request. It does not assign an IAM role. Labels in the story are on the Services list, after the service exists.
