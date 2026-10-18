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

export const pageTitle = "GuideRail. Your next step, in view.";

export const pageDescription =
  "GuideRail walks Create a Firestore database on the Firebase console. Cited Steps, Guide and Assist, and a Rules check. You click Create.";

export const judgeNote = "Judges sign in with the demo login from the deck.";

export const installSteps = [
  "Unzip the download.",
  "Open chrome://extensions in Chrome.",
  "Turn on Developer mode.",
  "Choose Load unpacked and select the unzipped folder that contains manifest.json.",
  "Pin GuideRail from the extensions menu.",
  "Open the Firebase console and start Create a Firestore database.",
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
  titleLead: "Your next step.",
  titleRest: "In view.",
  intro: "A route from the official docs to the field in front of you. Guide first. Guard always. You set the dial.",
  note: "The flagship Journey creates a Firestore database on the Firebase console. Guide and Assist. A Rules guard. You click Create.",
  journeyLink: "See the Firestore Journey",
  figureCaption: "Illustrative Firebase form. Synthetic values. No account connected.",
  staticStory:
    "Guide outlines Database ID and keeps the Firebase docs citation beside the Step. Assist proposes demo-guide, and an approval fills only that field on this page. Test mode is a Violation because anyone could read and overwrite the data. Production mode clears it. You press Create. The first click during a Violation is held and named. A second click continues anyway. This page sends nothing.",
} as const;

export const content: LandingContent = {
  name: "GuideRail",
  audience: "People creating a Firestore database in the Firebase console.",
  positioning: pageDescription,
  cta,
  route: {
    id: "route",
    heading: "Follow the rail",
    lede: "Goal, cited Steps, a Rules check, then Done.",
    stops: [
      {
        title: "Goal",
        tone: "go",
        paragraphs: ["Create a Firestore database."],
      },
      {
        title: "Cited Steps",
        tone: "step",
        paragraphs: ["The docs name the control. The open page confirms it."],
      },
      {
        title: "Rules check",
        tone: "check",
        paragraphs: ["Test mode is a Violation. Production mode clears it."],
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
    heading: "The Firestore Journey",
    lede: "Green is the way forward. Yellow asks you to check. Red is a Violation, and only a Violation.",
    stops: [
      {
        title: "Goal",
        tone: "go",
        paragraphs: [
          "Create a Firestore database. You choose the Firebase project. GuideRail opens the databases catalog and walks that wizard.",
          "Guide speaks or writes one Step at a time. Assist proposes a Database ID and types it into that one field only after you approve, then reads it back. Neither mode clicks Create.",
        ],
      },
      {
        title: "Cited Steps",
        tone: "step",
        paragraphs: [
          "The Journey is compiled from the Firebase manage-databases and locations docs before the voice session. Each Step names one control, in the order below.",
          "Database ID uses 4 to 63 lowercase letters, numbers, and hyphens. It starts with a letter, ends with a letter or number, and is not shaped like a UUID. Leave it blank and Standard edition uses (default). A deleted ID waits about five minutes before reuse. A project can hold 100 databases. The location cannot be changed after creation. Creating a database needs roles/datastore.owner, permission datastore.databases.create.",
          "If the doc names a control and the page does not show it, the coach says so and keeps the citation.",
        ],
      },
      {
        title: "Rules check",
        tone: "check",
        paragraphs: [
          "Test mode allows anyone to read and overwrite your data. That choice is a Violation. The control gets a red outline and the Rule text stays on screen. Production mode clears it.",
          "The first Create click during a Violation is held and named. A second click continues anyway. The guard is a warning in the extension. It does not replace Cloud IAM.",
        ],
      },
      {
        title: "Done",
        tone: "done",
        paragraphs: [
          "You click Create. The extension never clicks or sends. In Assist it types into one field, Database ID, only after you approve, then reads it back. On the illustration below, Assist fills demo-guide the same way.",
        ],
      },
    ],
  },
  faq: {
    id: "trust",
    heading: "Your control is part of the product",
    lede: "This website does not ask for a microphone, a camera, or a Google account.",
    items: [
      {
        question: "Who clicks Create?",
        answer:
          "You do. Guide highlights the Step and cites the doc. In Assist, the extension types into the Database ID field only after you approve, then reads it back. It never clicks or sends. You always click Create.",
      },
      {
        question: "What is a Violation?",
        answer:
          "A Rule whose check fails against what is on screen. In this Journey, Test mode is a Violation because anyone could read and overwrite the data. Production mode clears it. Red is reserved for that state.",
      },
      {
        question: "Does a failed check lock Create?",
        answer:
          "The first Create click is held and named. A second click continues anyway. The console stays available, and the click is still yours.",
      },
      {
        question: "Where do I practice before a real project?",
        answer:
          "The hosted coach serves labelled practice pages. They are copies for the extension, not the Firebase console, and they are not this illustration.",
      },
      {
        question: "Is the form on this page the Firebase console?",
        answer:
          "No. It is an illustration with synthetic values. Nothing you type here is sent. The extension Journey runs on the real Firebase console after you load it.",
      },
    ],
  },
  close: {
    heading: "A route you can understand. A decision that stays yours.",
    lede: "Guide first. Guard always. You set the dial.",
  },
  footer: "GuideRail. A Chrome extension. Guide first. Guard always. You set the dial.",
};

export const nav = [
  { href: "#journey", label: "Journey" },
  { href: "#install", label: "Install" },
  { href: "#trust", label: "Your control" },
];
