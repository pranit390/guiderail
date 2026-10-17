import type { LandingContent } from "../kit/types";

/**
 * Replace cta.href when the install or sandbox URL exists.
 * Every button on the page reads this object.
 */
export const cta = {
  label: "Start guided demo",
  href: "https://example.invalid/guiderail/demo",
  placeholder: true,
  note: "Placeholder. The install address is not published yet.",
} as const;

export const pageTitle = "GuideRail, your experts teach it once";
export const pageDescription =
  "GuideRail coaches people through Google tools one Step at a time, explains company Policy, and names a Violation before they save. You keep every click.";

export const hero = {
  title: "Your experts teach it once.",
  dek: "Every new hire is guided by it, and guarded by your rules. You keep every click.",
  lede: "GuideRail is a voice coach for Google tools. It highlights one Step on the live page, explains the Policy behind a field, and names a Violation before you save.",
  demoHeading: "Try one Step",
  figureCaption:
    "Illustration of the Cloud Run Services list. Synthetic data. Not a Google account.",
  goal: "Deploy a Cloud Run service our way",
  service: "ocr-service",
  region: "us-central1",
  details:
    "ocr-service is ready in us-central1. Labels are not on this tab. Your team adds them on the Services list, after the service exists.",
  policy:
    "Org Labeling Policy. Rule owner-format. Owner is a team or a first name. Use lowercase letters, numbers, and hyphens. No @ sign and no dots. Example, owner=pranit.",
  emptyOwner: "Empty",
  badOwner: "pranit@example.com",
  goodOwner: "pranit",
  violation:
    "Violation. Label values can't contain @ or dots. Corrective Step: change owner to pranit.",
  matched: "Matches the Rule. owner=pranit is a first name, with no @ and no dots.",
  captions: {
    ready:
      "Goal, deploy a Cloud Run service our way. Step, open Labels for ocr-service. Your team saves labels on the Services list, after the service exists.",
    shown: "Labels is highlighted. Open that tab yourself.",
    labels: "The owner field is empty. Open the Policy, or enter a value yourself.",
    policy:
      "Org Labeling Policy, Rule owner-format. Owner is a team or a first name. Use lowercase letters, numbers, and hyphens. No @ sign and no dots. Example, owner=pranit.",
    violation:
      "Violation of owner-format. Label values can't contain @ or dots. Corrective Step, change owner to pranit.",
    corrected:
      "owner=pranit matches the Rule. You click Save. The first Save with a Violation is held and named. A second click continues anyway.",
  },
  save: {
    held: "Held. 1 policy issue to fix first. Click Save again to continue anyway. This page does not submit the form.",
    second:
      "That second click would continue in the real console. Nothing was sent from this page.",
    ok: "You clicked Save. In the product, that click is yours. This page does not submit the form.",
  },
  actions: {
    show: "Show the Step",
    shown: "Step is on screen",
    policy: "Open the Policy",
    policyOpen: "Policy is open",
    bad: "Enter owner=pranit@example.com",
    fix: "Change owner to pranit",
    save: "Save",
    reset: "Start again",
  },
  beatsHeading: "What happens",
  beats: [
    "The Goal is to deploy a Cloud Run service our way. The Step on screen is to open Labels for ocr-service. Labels are saved on the Services list, after the service exists. The create form has no Labels field.",
    "Show the Step highlights Labels. You open the tab. The owner field stays empty until you enter a value.",
    "The Org Labeling Policy says owner is a team or a first name. Rule owner-format allows lowercase letters, numbers, and hyphens, and rejects an @ sign or a dot.",
    "If you enter owner=pranit@example.com, the check fails. That failure is a Violation. The corrective Step is to change the value to owner=pranit.",
    "The first Save while a Violation remains is held. GuideRail names the policy issue and says a second click continues anyway. You click Save. GuideRail never does.",
  ],
};

export const content: LandingContent = {
  name: "GuideRail",
  audience: "New hires, and people working in Google cloud consoles and admin tools.",
  positioning: pageDescription,
  cta,
  route: {
    id: "route",
    heading: "Guide, then you, then the guard",
    lede: "A Journey is one attempt to reach a Goal. GuideRail keeps the same order every time.",
    stops: [
      {
        title: "Guide",
        paragraphs: [
          "An expert teaches the task once in the real tool and says why. GuideRail drafts a Playbook with Gemini, and the expert publishes it before anyone else is guided by it.",
          "You name a Goal. GuideRail highlights one Step and puts the reason in the caption. In this example, us-central1 is the default unless the service is for an EU customer. The five labels are explained before Create, and they are entered later on the Services list.",
        ],
      },
      {
        title: "You act",
        paragraphs: [
          "You open the tab, type the value, and click Save or Send. This page waits for those controls. The owner field is empty until you choose a value.",
        ],
      },
      {
        title: "Guard",
        paragraphs: [
          "Each Rule has a guide and a check. When the check fails, that Rule is a Violation, and GuideRail shows a corrective Step.",
          "The first Save is held and named. A second click continues anyway. The console stays unlocked, and the click is still yours.",
        ],
      },
    ],
  },
  detour: {
    id: "detour",
    heading: "A Blocker opens a Detour",
    lede: "A Blocker is something on the screen that stops the Journey. A Detour is the side Journey that clears it, then returns to the main one.",
    stops: [
      {
        title: "Blocker",
        paragraphs: [
          "The Requester tries to deploy and the console says permission denied. The main Journey waits on that screen.",
        ],
      },
      {
        title: "Detour",
        paragraphs: [
          "GuideRail reads the permission in that message and names a least-privilege role. A denial for run.services.create maps to roles/run.developer. A later denial can name a different role, such as roles/iam.serviceAccountUser for iam.serviceAccounts.actAs.",
          "A Cloud Run deploy can raise more than one permission. Each denial maps to its own role.",
        ],
      },
      {
        title: "Requester",
        paragraphs: [
          "GuideRail opens a Gmail draft with the request and the approval link. The Requester reads the draft and clicks Send.",
        ],
      },
      {
        title: "Approver",
        paragraphs: [
          "The Approver opens the request and records a status: pending, granted, or rejected. A granted status is a record on the request. A person assigns the IAM role in IAM. The Requester returns to the console and retries the Step.",
        ],
      },
    ],
  },
  faq: {
    id: "trust",
    heading: "Permissions and trust",
    lede: "The demonstration needs no microphone, no camera, and no account. These are the same limits as the product.",
    items: [
      {
        question: "Does this page use a microphone or a Google account?",
        answer:
          "No. The captions carry the story. The Chrome extension can coach by voice on a live page. This website never asks for a microphone, a camera, or a sign-in.",
      },
      {
        question: "Who clicks?",
        answer:
          "You do. GuideRail highlights the Step and explains the Rule. The product has no tool that clicks, types, or sends for you. A Gmail draft waits for your Send.",
      },
      {
        question: "What is a Violation?",
        answer:
          "A Rule whose check fails against what is on screen. In the demonstration, owner=pranit@example.com fails Rule owner-format. The corrective Step is owner=pranit.",
      },
      {
        question: "Does a failed check lock Save?",
        answer:
          "The first Save is held. GuideRail names the policy issue and says a second click continues anyway. The console is not locked.",
      },
      {
        question: "What does the Approver's status change?",
        answer:
          "It stores pending, granted, or rejected on the request. A granted status does not assign an IAM role. The Requester retries the Step after access exists.",
      },
      {
        question: "Where are Cloud Run labels saved?",
        answer:
          "On the Services list, after the service exists. Select the service, open the info panel, and use the Labels tab. The create form has no Labels field.",
      },
      {
        question: "Is this console real?",
        answer:
          "It is a drawing. The service name ocr-service and the value owner=pranit are synthetic. Nothing on this page is sent to Google.",
      },
    ],
  },
  close: cta.placeholder
    ? {
        heading: "The demo link is a placeholder",
        lede: "When the install or sandbox URL is published, this button will go there. Until then the address is a placeholder, and the note under the button says so.",
      }
    : {
        heading: "Try GuideRail on your own console",
        lede: "Install the extension and walk one Goal with the coach. You keep every click.",
      },
  footer:
    "GuideRail. A Chrome extension for the Hack2skill AI Builder Cup 2026, Future of Work and Enterprise Productivity. Guide first. Guard second.",
};

export const nav = [
  { href: "#demo", label: "Demo" },
  { href: "#route", label: "Route" },
  { href: "#detour", label: "Detour" },
  { href: "#trust", label: "Trust" },
];
