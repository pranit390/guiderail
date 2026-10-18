import { FIRESTORE_GOAL } from "../../shared/journey.ts";
import type { FormState, PageSnapshot } from "./messages.ts";
import { databaseId } from "./assist-field.ts";
import { evaluate, type Rule } from "./policy.ts";
import { norm } from "./page.ts";

export type AssistContext = { tabId: number; url: string; bindingGeneration: number; snapshot: PageSnapshot };
type Plan = { context: AssistContext; pin: number; value: string; mode: "Production mode" | "Test mode"; before: string; formKey: string; createdAt: number };
export type AssistReceipt = { kind: "plan" | "fill" | "readback" | "mismatch" | "stop" | "violation"; at: string; field: "Database ID"; outcome: string };
type Options = {
  context: () => Promise<AssistContext>;
  current: () => Promise<{ tabId: number; url: string; bindingGeneration: number }>;
  readForm: () => Promise<FormState>;
  pin: (context: AssistContext, fieldIndex: number) => Promise<number>;
  fill: (plan: { context: AssistContext; pin: number; value: string; retry: boolean; guard: () => void }) => Promise<unknown>;
  rules: () => Rule[];
  checked: (form: FormState) => Promise<unknown>;
  receipt: (event: AssistReceipt) => void;
};

const formKey = (form: FormState) => JSON.stringify([form.url, Object.entries(form.fields).sort(), Object.entries(form.labels).sort()]);

export function mountAssist(container: HTMLElement, options: Options) {
  container.innerHTML = `<h2>Firestore assistance</h2>
    <label for="assist-level">Your control</label>
    <select id="assist-level"><option value="guide">Guide · you type</option><option value="assist">Assist · approve Database ID fill</option></select>
    <div data-assist-body hidden>
      <p>Only Database ID can be filled. You choose location and mode, and click every button in the console.</p>
      <form id="assist-questions">
        <label for="assist-id">Database ID</label><input id="assist-id" value="(default)" autocomplete="off" spellcheck="false">
        <label for="assist-mode">Desired security mode</label><select id="assist-mode"><option>Production mode</option><option>Test mode</option></select>
        <button type="submit">Review plan</button>
      </form>
      <section data-plan hidden aria-label="What I will do"><h3>What I will do</h3><ol data-plan-rows></ol>
        <a class="citation" href="${FIRESTORE_GOAL.sourceUrls[0]}#database_id" target="_blank" rel="noopener noreferrer">Source: Firebase · Database ID</a>
        <p><a class="citation" href="https://firebase.google.com/docs/firestore/locations" target="_blank" rel="noopener noreferrer">Location cannot be changed later · Firebase locations</a></p>
        <button type="button" data-approve>Approve and fill Database ID</button>
        <button type="button" data-copy>Copy Database ID</button>
      </section>
    </div><p data-assist-status role="status">Guide is the default. You do every click and keystroke.</p>`;
  const get = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  const level = get<HTMLSelectElement>("#assist-level");
  const id = get<HTMLInputElement>("#assist-id");
  const desiredMode = get<HTMLSelectElement>("#assist-mode");
  const review = get<HTMLButtonElement>("#assist-questions button");
  const approve = get<HTMLButtonElement>("[data-approve]");
  const copy = get<HTMLButtonElement>("[data-copy]");
  const status = get("[data-assist-status]");
  const stop = document.createElement("button");
  stop.type = "button"; stop.textContent = "Stop Assist"; stop.hidden = true;
  // The Stop control stays outside the scrolling cards, alongside the composer.
  container.after(stop);
  let revision = 0;
  let plan: Plan | undefined;
  let copyValue: string | undefined;
  let busy = false;
  let enabled = true;
  const emit = (kind: AssistReceipt["kind"], outcome: string) => options.receipt({ kind, at: new Date().toISOString(), field: "Database ID", outcome });
  function invalidate(message: string) {
    revision++; plan = undefined; copyValue = undefined;
    approve.disabled = true; copy.disabled = true;
    get("[data-plan]").hidden = true;
    status.textContent = `${message} Already filled values remain; correct them manually.`;
  }
  function cancel(message = "Assist stopped. Queued fills cancelled.") {
    const wasActive = level.value === "assist" || !!plan || busy;
    if (!wasActive) return;
    invalidate(message); emit("stop", "cancelled; already filled values remain");
  }
  stop.onclick = () => cancel();
  level.onchange = () => {
    if (level.value === "assist") { invalidate(""); status.textContent = "Assist selected. Answer both questions, then review your plan."; }
    else { cancel("Guide selected. Guide cannot fill."); invalidate("Guide selected. Guide cannot fill."); }
    get("[data-assist-body]").hidden = level.value !== "assist";
    stop.hidden = level.value !== "assist";
  };
  for (const control of [id, desiredMode]) control.addEventListener("input", () => invalidate("Your answers changed. Review a new plan."));
  const active = (token: number) => {
    if (token !== revision || level.value !== "assist" || !enabled) throw new Error("Assist stopped or the plan changed. Review and approve again.");
  };
  async function current(p: Plan, token: number) {
    active(token);
    if (Date.now() - p.createdAt > 120_000) throw new Error("This approval is stale. Review and approve a new plan.");
    const now = await options.current();
    active(token);
    if (now.tabId !== p.context.tabId || now.url !== p.context.url || now.bindingGeneration !== p.context.bindingGeneration) throw new Error("Journey changed. Return to the bound tab and review a new plan.");
  }
  function check(form: FormState, p: Pick<Plan, "value" | "mode">, planned: boolean) {
    if (p.mode === "Test mode") throw new Error('Test mode blocks Assist: it “allows anyone to read and overwrite your data.” Choose Production mode and review again.');
    const testSelected = Object.entries(form.fields).some(([key, value]) =>
      (/^test mode$/i.test(key) && /^(checked|true|test mode)$/i.test(value)) ||
      (/^(security mode|mode)$/i.test(key) && /test/i.test(value)));
    if (testSelected) throw new Error("Test mode is selected on the page. Choose Production mode yourself, then review again.");
    const projected = planned ? { ...form, fields: { ...form.fields, "Database ID": p.value, "Test mode": "unchecked", "Production mode": "checked", "Security mode": p.mode, Mode: p.mode } } : form;
    const blocking = evaluate(options.rules(), projected).filter((v) => v.severity === "block");
    if (blocking.length) { emit("violation", "blocking Rule"); throw new Error("A blocking Rule pauses Assist. Fix the Policy issues, then review again."); }
  }
  get<HTMLFormElement>("#assist-questions").onsubmit = (event) => {
    event.preventDefault();
    if (busy || level.value !== "assist" || !enabled) return;
    const token = ++revision;
    plan = undefined; copyValue = undefined; approve.disabled = true; copy.disabled = true;
    get("[data-plan]").hidden = true;
    let value: string;
    try { value = databaseId(id.value); } catch (error) { status.textContent = error instanceof Error ? error.message : "Invalid Database ID."; return; }
    const mode = desiredMode.value === "Test mode" ? "Test mode" : "Production mode";
    const rows = get("[data-plan-rows]");
    rows.replaceChildren(...[`Database ID: ${value} · your answer. I fill only this text field.`, `${mode} · your answer. You select this yourself.`, "Location · you choose manually; it cannot be changed later.", "You click Create"].map((text) => { const li = document.createElement("li"); li.textContent = text; return li; }));
    get("[data-plan]").hidden = false;
    // Planned Test mode never reaches a page mutation or an approval.
    try { check({ url: "", labels: {}, fields: {}, sections: [] }, { value, mode }, true); }
    catch (error) { status.textContent = error instanceof Error ? error.message : "Plan blocked."; return; }
    copyValue = value; copy.disabled = false;
    busy = true; review.disabled = true;
    status.textContent = "Reading the bound Database ID step and checking the planned end state…";
    void (async () => {
      try {
        const context = await options.context(); active(token);
        const matches = context.snapshot.elements.filter((el) => norm(el.name) === "database id" && el.role === "textbox");
        if (matches.length !== 1) throw new Error("Database ID is missing or ambiguous. Re-read this step, or type your value manually.");
        const pin = await options.pin(context, matches[0].i); active(token);
        const form = await options.readForm(); active(token);
        check(form, { value, mode }, true);
        const p: Plan = { context, pin, value, mode, before: form.fields["Database ID"] ?? "", formKey: formKey(form), createdAt: Date.now() };
        await current(p, token);
        plan = p; approve.disabled = false; copy.disabled = false;
        status.textContent = "Planned end state checked against Rules. Approve this Database ID only. Mode and location stay manual.";
        emit("plan", "awaiting human approval");
      } catch (error) { if (token === revision) status.textContent = error instanceof Error ? error.message : "Could not read this step. Type the value manually."; }
      finally { busy = false; review.disabled = !enabled; }
    })();
  };
  async function fill(p: Plan) {
    busy = true; approve.disabled = true; review.disabled = true;
    const token = revision;
    try {
      await current(p, token);
      const before = await options.readForm(); await current(p, token);
      if (formKey(before) !== p.formKey || (before.fields["Database ID"] ?? "") !== p.before) throw new Error("The form changed after approval. Review and approve a new plan.");
      check(before, p, true);
      for (let attempt = 0; attempt < 2; attempt++) {
        await current(p, token);
        // No transport retry: a lost reply must never replay a mutation.
        await options.fill({ context: p.context, pin: p.pin, value: p.value, retry: attempt === 1, guard: () => active(token) });
        emit("fill", attempt ? "single change/blur retry" : "native setter with input/change");
        active(token);
        const form = await options.readForm(); await current(p, token);
        await options.checked(form); active(token);
        check(form, p, false);
        if (form.fields["Database ID"] === p.value) {
          emit("readback", "verified; Rules rerun");
          plan = undefined;
          status.textContent = `Read back Database ID: ${p.value}. Rules re-run on the current form. You select Production mode and location. You click Create.`;
          return;
        }
      }
      emit("mismatch", "readback mismatch after one retry");
      throw new Error("The field did not retain the value after one retry. Assist stopped. Copy Database ID and type it yourself.");
    } catch (error) {
      plan = undefined;
      const message = error instanceof Error ? error.message : "Assist could not verify the field. Type the value yourself.";
      if (token === revision) status.textContent = `${message} Already filled values remain; correct them manually.`;
    } finally { busy = false; review.disabled = !enabled; }
  }
  approve.onclick = () => {
    if (!plan || busy || approve.disabled || level.value !== "assist" || !enabled) return;
    void fill(plan);
  };
  copy.onclick = () => {
    // The copy value comes from the numbered plan, never from model/page text.
    if (!copyValue) return;
    void navigator.clipboard.writeText(copyValue).then(() => { status.textContent = "Database ID copied. You paste or type it; you click Create."; }).catch(() => { status.textContent = "Clipboard unavailable. Type the Database ID shown in the plan yourself."; });
  };
  return { invalidate, stop: cancel, setEnabled(value: boolean) { enabled = value; level.disabled = !value; review.disabled = !value; if (!value) cancel("Assist unavailable in Teach mode."); }, stopControl: stop };
}
