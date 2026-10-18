import type { LandingContent } from "../kit/types";
import coach from "./coach.json";

/** Hosted coach build. It includes the Firebase sign-in key. The landing build does not produce this file. */
export const downloadHref = `${coach.origin}/download/guiderail-extension.zip`;

export const coachOrigin = coach.origin;

export const practiceHref = `${coachOrigin}/sandbox/index.html`;

export const consoleHref = "https://console.firebase.google.com/project/_/firestore/databases";

export const docsHref = "https://firebase.google.com/docs/firestore/manage-databases";

export const locationsHref = "https://firebase.google.com/docs/firestore/locations";

export const cta = {
  label: "Download the Chrome extension",
  href: downloadHref,
} as const;

export const pageTitle = "GuideRail. A Chrome coach for cloud console tasks";

export const pageDescription =
  "A Chrome side panel that walks you through tasks on the Google Cloud and Firebase consoles, Step by Step, from the official docs and your team's Playbooks. A Rules guard warns you before an unsafe choice, and you make every Create click yourself.";

export const judgeNote = "Judges, sign in with the demo login from the pitch deck.";

export const installSteps = [
  "Unzip the download.",
  "Open chrome://extensions in Chrome.",
  "Turn on Developer mode.",
  "Click Load unpacked and pick the unzipped folder. It's the one with manifest.json inside.",
  "Click Open GuideRail on the welcome page. It also shows your keyboard shortcut, or how to set one.",
  "Pin GuideRail from the extensions menu.",
  "Open the Firebase console and start creating a Firestore database.",
  "Click the toolbar icon or press your shortcut. Sign in, then type or talk. You don't need a microphone to type.",
] as const;

export const citedControls = [
  "Databases & Storage",
  "Firestore",
  "Add database",
  "Standard edition",
  "Next",
  "Database ID",
  "Location",
  "Next",
  "Production mode",
  "Create",
] as const;

export const hero = {
  titleLead: "GuideRail points.",
  titleRest: "You click.",
  intro:
    "GuideRail is a Chrome side panel for the Google Cloud and Firebase consoles. Pick a goal and it highlights the next control on the real page, one Step at a time. The Steps come from the official docs or from a Playbook your team's expert recorded. A Rules guard flags unsafe choices before you create anything.",
  note: "Guide only points. Assist types into one field you approve and reads it back. Neither one clicks Create for you. The worked example below creates a Firestore database.",
  journeyLink: "See the Firestore Journey",
  figureCaption: "This is a mock of the Firebase form with made-up values. It isn't connected to any account.",
  staticStory:
    "Guide outlines the Database ID field and keeps the Firebase docs citation next to the Step. Assist proposes demo-guide. When you approve, it fills that one field on this page. Test mode is a Violation because anyone could read and overwrite the data, and Production mode clears it. You press Create. If a Violation is showing, GuideRail holds your first click and names the Rule. A second click goes through anyway. This page sends nothing.",
} as const;

export const content: LandingContent = {
  name: "GuideRail",
  audience: "People doing tasks on the Google Cloud and Firebase consoles, and the experts who teach them.",
  positioning: pageDescription,
  cta,
  route: {
    id: "route",
    heading: "The Journey in four stops",
    lede: "Goal, cited Steps, Rules check, then you click Create.",
    stops: [
      {
        title: "Goal",
        tone: "go",
        paragraphs: ["Pick a task, like creating a Firestore database."],
      },
      {
        title: "Cited Steps",
        tone: "step",
        paragraphs: ["Each Step names a control from the docs or a Playbook. GuideRail finds it on the page."],
      },
      {
        title: "Rules check",
        tone: "check",
        paragraphs: ["Unsafe choices are Violations, like Firestore Test mode."],
      },
      {
        title: "Done",
        tone: "done",
        paragraphs: ["You click Create."],
      },
    ],
  },
  journey: {
    id: "journey",
    heading: "The Firestore Journey, a worked example",
    lede: "Creating a Firestore database is the Journey we show in full. Green means carry on and yellow means look first. Red is kept for Violations and nothing else.",
    stops: [
      {
        title: "Goal",
        tone: "go",
        paragraphs: [
          "You pick the Firebase project. GuideRail opens its databases page and walks you through the create wizard.",
          "Guide gives you one Step at a time, out loud or in text. Assist also suggests a Database ID. Once you approve, it types the ID into that one field and reads it back. Neither mode clicks Create.",
        ],
      },
      {
        title: "Cited Steps",
        tone: "step",
        paragraphs: [
          "Before the voice session starts, GuideRail builds the Journey from two Firebase docs, Manage databases and Cloud Firestore locations. Each Step names one control, in this order.",
          "The docs set the rules for the ID. It is 4 to 63 lowercase letters, numbers and hyphens, starts with a letter, ends with a letter or number, and can't look like a UUID. Leave it blank and Standard edition uses (default). After you delete a database, its ID takes about five minutes to free up. A project can hold 100 databases. You can't move a database to another location after you create it. Creating one needs roles/datastore.owner, which carries the datastore.databases.create permission.",
          "If the docs name a control the page doesn't show, the coach tells you and keeps the citation up.",
        ],
      },
      {
        title: "Rules check",
        tone: "check",
        paragraphs: [
          "Test mode lets anyone read and overwrite your data, so picking it is a Violation. GuideRail outlines that option in red and keeps the Rule text on screen. Switch to Production mode and it clears.",
          "While a Violation is showing, GuideRail holds your first Create click and names the Rule. Click again and it goes through. The guard is a warning inside the extension. It doesn't replace Cloud IAM.",
        ],
      },
      {
        title: "Done",
        tone: "done",
        paragraphs: [
          "You click Create. The extension never clicks or sends anything. In the demo below, Assist fills demo-guide into Database ID the same way it does on the console.",
        ],
      },
    ],
  },
  today: {
    id: "today",
    heading: "Where it is today",
    lede: "This is what ships in the extension and the hosted coach right now.",
    items: [
      "A Chrome side panel that runs on Google Cloud and Firebase console pages.",
      "You talk or type. Gemini Live on Vertex AI answers by voice and in text.",
      "A goal picker. The Firestore Journey is compiled from two official Firebase docs, with a citation on each Step. Three more goals come from Playbooks: view Cloud Run logs, connect a custom domain to Firebase Hosting, and create a Cloud Storage bucket.",
      "Guide outlines the next control and moves on by itself when you finish the Step.",
      "Assist fills one approved field, the Firestore Database ID, and reads the value back.",
      "The Rules guard flags unsafe choices, like Firestore Test mode, and holds your first Create click.",
      "Learn mode. An expert does the task once and GuideRail drafts a Playbook with suggested Rules. The expert reviews it before anyone is guided by it.",
      "Playbooks, Rules and compiled Journeys are stored in Firestore. The coach runs on Cloud Run, and you sign in with Firebase Auth.",
      "You click Create. Every time.",
    ],
  },
  roadmap: {
    id: "roadmap",
    heading: "Roadmap",
    lede: "These are plans, not features. Nothing in this section ships today.",
    groups: [
      {
        title: "Next",
        items: [
          {
            title: "More Journeys and more sites",
            text: "A docs finder picks the right official page for a goal. A compiled Journey is marked unverified until a person walks it once. Slack app setup is the first site outside Google.",
          },
          {
            title: "Sessions that survive the panel",
            text: "The microphone and the voice connection move out of the side panel, so closing the panel no longer ends the session.",
          },
          {
            title: "Zen mode",
            text: "A small bubble on the page listens and answers by voice, with a one-line caption. Click it to open the full panel.",
          },
          {
            title: "More Assist, then Auto",
            text: "Assist fills more kinds of fields, with approval per Step and undo before submit. An Auto level moves through a wizard inside a plan you approved. No level gets a click or submit tool.",
          },
        ],
      },
      {
        title: "Later",
        items: [
          {
            title: "On-device hybrid",
            text: "Doc lookup with EmbeddingGemma and short field hints from Gemini Nano or Gemma run in the browser. Rules stay deterministic and Gemini Live stays the voice. It depends on Chrome's on-device model being available on your machine.",
          },
          {
            title: "One-click setup on Google Cloud",
            text: "Sign in with Google, then a wizard sets the coach up in your own Google Cloud project from a Cloud Run template. Install moves to the Chrome Web Store.",
          },
          {
            title: "Policy-guarded MCP for other agents",
            text: "GuideRail's guarded tools become an MCP server, read-only first. Another agent could read the page, highlight a control and check a Rule, but never click, submit or send. Fills would come later, each one approved in the side panel.",
          },
          {
            title: "Chief of staff",
            text: "One timeline of every Journey, whether a person or an agent did the work, with the Rule checks and approvals beside each Step.",
          },
        ],
      },
    ],
  },
  faq: {
    id: "trust",
    heading: "What GuideRail will and won't do",
    lede: "This website doesn't ask for your microphone, your camera or a Google account.",
    items: [
      {
        question: "Who clicks Create?",
        answer:
          "You do, every time. Guide highlights the Step and cites the doc. Assist types into the Database ID field after you approve and reads it back. Today that is the only field it touches, and it never clicks or sends.",
      },
      {
        question: "What is a Violation?",
        answer:
          "A Rule that fails against what's on screen. In this Journey, Test mode is a Violation because anyone could read and overwrite the data. Production mode clears it. GuideRail uses red for Violations and nothing else.",
      },
      {
        question: "Does a failed check lock Create?",
        answer:
          "No. GuideRail holds your first click and names the Rule. Click again and it goes through. The console never locks.",
      },
      {
        question: "Where do I practice before a real project?",
        answer:
          "On the labelled practice pages the hosted coach serves. They're copies built for the extension to run on. They aren't the Firebase console, and they aren't the demo on this page.",
      },
      {
        question: "Is the form on this page the Firebase console?",
        answer:
          "No. It's a mock with made-up values, and nothing you type in it leaves the page. Once you load the extension, the Journey runs on the real Firebase console.",
      },
    ],
  },
  close: {
    heading: "Download it, load it, then open GuideRail on a Google Cloud or Firebase console page.",
    lede: "Use the toolbar icon or your keyboard shortcut. The welcome page shows the shortcut, or how to set one.",
  },
  footer:
    "GuideRail is a Chrome extension that coaches you through cloud console tasks from the official docs and your team's Playbooks. You make every consequential click.",
};

export const nav = [
  { href: "#journey", label: "How it works" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#install", label: "Install" },
  { href: "#trust", label: "Questions" },
];
