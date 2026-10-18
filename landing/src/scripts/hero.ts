type Mode = "guide" | "assist";

function must<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return node as T;
}

export function startExample(root: HTMLElement): void {
  const idField = must<HTMLElement>(root, "[data-id-field]");
  const dbId = must<HTMLInputElement>(root, "[data-db-id]");
  const caption = must<HTMLElement>(root, "[data-caption]");
  const coachCopy = must<HTMLElement>(root, "[data-coach-copy]");
  const state = must<HTMLElement>(root, "[data-state]");
  const stateText = must<HTMLElement>(root, "[data-state-text]");
  const proposal = must<HTMLElement>(root, "[data-proposal]");
  const rule = must<HTMLElement>(root, "[data-rule]");
  const testChoice = must<HTMLElement>(root, "[data-test-choice]");
  const createResult = must<HTMLElement>(root, "[data-create-result]");
  const guide = must<HTMLButtonElement>(root, "[data-guide]");
  const assist = must<HTMLButtonElement>(root, "[data-assist]");
  const approve = must<HTMLButtonElement>(root, "[data-approve]");
  const showStep = must<HTMLButtonElement>(root, "[data-show-step]");
  const create = must<HTMLButtonElement>(root, "[data-create]");
  const reset = must<HTMLButtonElement>(root, "[data-reset]");
  const stopPlan = must<HTMLButtonElement>(root, "[data-stop]");

  let mode: Mode = "guide";
  let held = false;

  const selectedMode = () => {
    const picked = root.querySelector<HTMLInputElement>('[name="db-mode"]:checked');
    return picked?.value === "test" ? "test" : "production";
  };

  const paint = () => {
    const broken = selectedMode() === "test";
    rule.hidden = !broken;
    testChoice.classList.toggle("broken", broken);
    if (broken) {
      state.className = "status-word stop";
      stateText.textContent = "Violation. Check before Create.";
      caption.textContent = "This choice breaks a Rule.";
      return;
    }
    state.className = mode === "guide" ? "status-word go" : "status-word check";
    stateText.textContent = mode === "guide" ? "Guide. You act." : "Assist. Review the proposal.";
    caption.textContent = mode === "guide" ? "Find the field. Keep the choice." : "A little help, with your approval.";
  };

  const setMode = (next: Mode) => {
    mode = next;
    guide.setAttribute("aria-pressed", String(next === "guide"));
    assist.setAttribute("aria-pressed", String(next === "assist"));
    proposal.hidden = next !== "assist";
    approve.disabled = false;
    stopPlan.disabled = false;
    coachCopy.textContent =
      next === "guide"
        ? "You enter the value. The citation stays beside the Step."
        : "Assist asks before it changes the text field. This page does not change the Firebase console.";
    paint();
  };

  showStep.addEventListener("click", () => {
    idField.classList.add("highlight");
    idField.classList.remove("motion-pulse");
    void idField.offsetWidth;
    idField.classList.add("motion-pulse");
    caption.textContent = "Database ID is the next Step.";
    coachCopy.textContent = "The outlined field is the current target. Type a value yourself, or switch to Assist.";
  });

  guide.addEventListener("click", () => setMode("guide"));
  assist.addEventListener("click", () => setMode("assist"));

  approve.addEventListener("click", () => {
    if (selectedMode() === "test") {
      coachCopy.textContent = "Plan paused. Clear the Violation before approving a fill.";
      return;
    }
    dbId.value = "demo-guide";
    idField.classList.add("highlight");
    coachCopy.textContent = "Read-back matches demo-guide. You choose the mode and click Create.";
    approve.disabled = true;
  });

  stopPlan.addEventListener("click", () => {
    proposal.hidden = true;
    coachCopy.textContent = "Plan stopped. A value already in the field stays there.";
  });

  root.querySelectorAll<HTMLInputElement>('[name="db-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      held = false;
      createResult.textContent = "The final action remains yours.";
      paint();
    });
  });

  create.addEventListener("click", () => {
    const broken = selectedMode() === "test";
    if (broken && !held) {
      held = true;
      createResult.textContent =
        "First click held. Test mode is a Violation. Choose Production mode, or click again to continue anyway. This page sends nothing.";
      return;
    }
    createResult.textContent = broken
      ? "A second click would continue despite the Violation. This page sends nothing."
      : "You made the final click. This page sends nothing.";
  });

  reset.addEventListener("click", () => {
    dbId.value = "";
    const production = root.querySelector<HTMLInputElement>('[name="db-mode"][value="production"]');
    if (production) production.checked = true;
    held = false;
    idField.classList.remove("highlight", "motion-pulse");
    createResult.textContent = "The final action remains yours.";
    setMode("guide");
    caption.textContent = "Start with the field. Understand it as you go.";
  });
}
