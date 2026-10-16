import { Type, type FunctionDeclaration } from "@google/genai";
import { approvals, approvalUrl, lookupRole } from "./approvals.ts";

// Tools Gemini may call. Most run in the extension and the relay only forwards them;
// the ones in SERVER_TOOLS run here in the relay (see runServerTool).
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
  {
    name: "draft_message",
    description:
      "Open a pre-filled email compose window for the user to review. It does not send; the user clicks Send themselves.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "Recipient email address, e.g. the Approver." },
        subject: { type: Type.STRING, description: "Subject line." },
        body: { type: Type.STRING, description: "Plain-text body." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "lookup_role",
    description:
      "Find the least-privilege predefined IAM role that grants a permission, e.g. run.services.create. Returns {role, title} or found:false.",
    parameters: {
      type: Type.OBJECT,
      properties: { permission: { type: Type.STRING, description: "Permission from the error text, e.g. run.services.create." } },
      required: ["permission"],
    },
  },
  {
    name: "create_approval",
    description: "Create an approval request for the Approver and return a link to it ({id, url}).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        requester: { type: Type.STRING, description: "Email of the user who needs access." },
        role: { type: Type.STRING, description: "Role ID from lookup_role, e.g. roles/run.developer." },
        resource: { type: Type.STRING, description: "Project or resource the role is needed on." },
        reason: { type: Type.STRING, description: "One sentence on why, in the user's words." },
      },
      required: ["requester", "role", "resource", "reason"],
    },
  },
];

export const SERVER_TOOLS = new Set(["lookup_role", "create_approval"]);

export async function runServerTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const str = (key: string) => String(args[key] ?? "");
  switch (name) {
    case "lookup_role":
      return lookupRole(str("permission")) ?? { found: false };
    case "create_approval": {
      const approval = await approvals.create({
        requester: str("requester"),
        role: str("role"),
        resource: str("resource"),
        reason: str("reason"),
      });
      return { id: approval.id, url: approvalUrl(approval.id) };
    }
    default:
      return { error: `unknown server tool ${name}` };
  }
}

export const systemInstruction = `You are GuideRail, a voice coach for Google tools. Guide first, guard second.

How you work:
- The user does every click and keystroke. You never claim to have done anything on the page.
- Before saying where something is, call read_page. Then call highlight on the exact element, and say one short sentence about it.
- Give one step at a time. After you highlight, stop talking and wait. You will receive a [page event] message when the user clicks the highlighted element, the page changes, or they are about to submit. Then call read_page and give the next step.
- When the user reaches a form section with company Rules (for example Labels), call get_guidance first and explain the requirements and suggested values before they type.
- Before the user submits a form, call check_policy. If Violations remain, explain the fix for the most important one and highlight its field.
- If the page shows a permission error (for example "You don't have permission" or "required permission(s)"), clear it with a Detour: call lookup_role with the permission from the error text, then create_approval with the role and the project or resource, then draft_message to the Approver with the approval link in the body. Ask the user for the Approver's email if you don't know it. Then tell the user to review the email and click Send themselves.
- Keep spoken replies short: one or two sentences. Use plain words.`;
