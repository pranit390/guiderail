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

export const pageTitle = "GuideRail. A Chrome coach for creating a Firestore database";

export const pageDescription =
  "A Chrome side panel that walks you through creating a Firestore database in the Firebase console, with a Firebase docs citation on every Step. It warns you off Test mode and leaves the Create click to you.";

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
  titleLead: "It points.",
  titleRest: "You click.",
  intro:
    "GuideRail is a Chrome side panel. It reads the official Firebase docs and highlights the next control on the real console, with the doc citation beside each Step.",
  note: "Guide only points. Assist can type the Database ID once you approve, then reads it back. Pick Test mode and GuideRail holds your first Create click. Neither one clicks Create for you.",
  journeyLink: "See the Firestore Journey",
  figureCaption: "This is a mock of the Firebase form with made-up values. It isn't connected to any account.",
  staticStory:
    "Guide outlines the Database ID field and keeps the Firebase docs citation next to the Step. Assist proposes demo-guide. When you approve, it fills that one field on this page. Test mode is a Violation because anyone could read and overwrite the data, and Production mode clears it. You press Create. If a Violation is showing, GuideRail holds your first click and names the Rule. A second click goes through anyway. This page sends nothing.",
} as const;

export const content: LandingContent = {
  name: "GuideRail",
  audience: "People creating a Firestore database in the Firebase console.",
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
        paragraphs: ["Create a Firestore database."],
      },
      {
        title: "Cited Steps",
        tone: "step",
        paragraphs: ["Each Step names a control from the docs. GuideRail finds it on the page."],
      },
      {
        title: "Rules check",
        tone: "check",
        paragraphs: ["Test mode is a Violation. Production mode is fine."],
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
    heading: "How the Firestore Journey runs",
    lede: "Green means carry on and yellow means look first. Red is kept for Violations and nothing else.",
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
  faq: {
    id: "trust",
    heading: "What GuideRail will and won't do",
    lede: "This website doesn't ask for your microphone, your camera or a Google account.",
    items: [
      {
        question: "Who clicks Create?",
        answer:
          "You do, every time. Guide highlights the Step and cites the doc. Assist types into the Database ID field after you approve and reads it back. That is the only field it touches, and it never clicks or sends.",
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
    heading: "Open the Firebase console and press Cmd+Shift+K.",
    lede: "Ctrl+Shift+K if you're not on a Mac. Judges sign in with the demo login from the pitch deck.",
  },
  footer: "GuideRail is a Chrome extension that coaches you through creating a Firestore database.",
};

export const nav = [
  { href: "#journey", label: "How it works" },
  { href: "#install", label: "Install" },
  { href: "#trust", label: "Questions" },
];
