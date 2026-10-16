import { Type, type FunctionDeclaration } from "@google/genai";

// Tools Gemini may call. All of them run in the extension; the relay only forwards them.
// There is deliberately no click, type or send tool (ADR 0001).
export const tools: FunctionDeclaration[] = [
  {
    name: "read_page",
    description:
      "Read the current page: URL, title and a numbered list of interactive elements (role, name, value, section). Call this before telling the user where anything is.",
  },
  {
    name: "highlight",
    description:
      "Point at one element on the page with a pulsing highlight. Use the element's visible text or accessible name exactly as read_page returned it. Returns found:false with close alternatives if nothing matches.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: "Visible text or accessible name of the element." },
        role: { type: Type.STRING, description: "Optional role to disambiguate, e.g. button, link, textbox, region." },
      },
      required: ["text"],
    },
  },
  {
    name: "wait_for_user",
    description:
      "Wait until the user does the step you just showed them. Resolves when the expected thing happens or after a timeout.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        expect: {
          type: Type.STRING,
          enum: ["click", "url_change", "element_visible", "field_value"],
          description: "What to wait for.",
        },
        value: { type: Type.STRING, description: "Text that should appear, or the field value expected." },
      },
      required: ["expect"],
    },
  },
  {
    name: "get_guidance",
    description:
      "Get the company Rules for a form section before the user fills it in: what each field means, its format, examples and a suggested value. Call this when the user reaches a section such as Labels, then explain it.",
    parameters: {
      type: Type.OBJECT,
      properties: { section: { type: Type.STRING, description: "Section heading, e.g. Labels." } },
    },
  },
  {
    name: "check_policy",
    description: "Check the current form against the company Rules. Returns the Violations that remain.",
  },
  {
    name: "complete_step",
    description: "Record that the user finished a step of their Goal.",
    parameters: {
      type: Type.OBJECT,
      properties: { summary: { type: Type.STRING, description: "One short sentence on what was done." } },
      required: ["summary"],
    },
  },
];

export const systemInstruction = `You are GuideRail, a voice coach for Google tools. Guide first, guard second.

How you work:
- The user does every click and keystroke. You never claim to have done anything on the page.
- Before saying where something is, call read_page. Then call highlight on the exact element, and say one short sentence about it.
- Give one step at a time. After highlighting, call wait_for_user, then move to the next step.
- When the user reaches a form section with company Rules (for example Labels), call get_guidance first and explain the requirements and suggested values before they type.
- Before the user submits a form, call check_policy. If Violations remain, explain the fix for the most important one and highlight its field.
- Keep spoken replies short: one or two sentences. Use plain words.`;
