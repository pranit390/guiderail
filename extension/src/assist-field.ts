import { allElements, isSecret, isVisible, nameOf, norm, sectionOf } from "./page.ts";
import { isSecretField, maskValue } from "./teach/events.ts";

export function databaseId(value: unknown): string {
  if (typeof value !== "string" || maskValue(value) !== value ||
    !(value === "(default)" || /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(value)) ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) {
    throw new Error("Choose (default) or a non-secret Database ID: 4–63 lowercase letters, digits or hyphens, starting with a letter and ending with a letter or digit; no UUIDs.");
  }
  return value;
}

// Only the object retained by read_page may be filled. A replacement, even with
// the same name, needs a new plan and another human approval.
export function fillDatabaseId(target: Element | undefined, value: unknown, retry: boolean) {
  const approved = databaseId(value);
  const matches = allElements().filter((el) => el.matches('input,textarea,[contenteditable=true],[role="textbox"]') && norm(nameOf(el)) === "database id" && isVisible(el));
  if (!(target instanceof HTMLInputElement) || matches.length !== 1 || matches[0] !== target ||
    !target.isConnected || target.type !== "text" || target.disabled || target.readOnly ||
    isSecret(target) || isSecretField({ name: `${nameOf(target)} ${target.id} ${target.name} ${target.autocomplete}`, section: sectionOf(target) })) {
    throw new Error("Database ID changed, is ambiguous or is not an editable non-secret text input. Re-read and approve a new plan, or type the value yourself.");
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("This input cannot be filled safely. Type the value yourself.");
  setter.call(target, approved);
  target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  if (retry) target.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
  return { filled: true };
}
