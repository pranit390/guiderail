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
      stateText.textContent = "Violation. Look before you click Create.";
      caption.textContent = "Test mode breaks a Rule.";
      return;
    }
    state.className = mode === "guide" ? "status-word go" : "status-word check";
    stateText.textContent = mode === "guide" ? "Guide. You type and click." : "Assist. Check the proposed value.";
    caption.textContent = mode === "guide" ? "GuideRail points. You type." : "GuideRail can type the ID if you approve.";
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
        ? "You type the value. The docs citation stays next to the Step."
        : "Assist asks before it touches the text field. Nothing on this page reaches the Firebase console.";
    paint();
  };

  showStep.addEventListener("click", () => {
    idField.classList.add("highlight");
    idField.classList.remove("motion-pulse");
    void idField.offsetWidth;
    idField.classList.add("motion-pulse");
    caption.textContent = "Database ID is the next Step.";
    coachCopy.textContent = "That outlined field is the one to fill. Type a value, or switch to Assist.";
  });

  guide.addEventListener("click", () => setMode("guide"));
  assist.addEventListener("click", () => setMode("assist"));

  approve.addEventListener("click", () => {
    if (selectedMode() === "test") {
      coachCopy.textContent = "Paused. Switch to Production mode before you approve the fill.";
      return;
    }
    dbId.value = "demo-guide";
    idField.classList.add("highlight");
    coachCopy.textContent = "The field reads back demo-guide. Now pick a mode and click Create.";
    approve.disabled = true;
  });

  stopPlan.addEventListener("click", () => {
    proposal.hidden = true;
    coachCopy.textContent = "Stopped. Anything already in the field stays there.";
  });

  root.querySelectorAll<HTMLInputElement>('[name="db-mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      held = false;
      createResult.textContent = "The last click is yours.";
      paint();
    });
  });

  create.addEventListener("click", () => {
    const broken = selectedMode() === "test";
    if (broken && !held) {
      held = true;
      createResult.textContent =
        "First click held, because Test mode is a Violation. Switch to Production mode, or click again to go ahead anyway. This page sends nothing.";
      return;
    }
    createResult.textContent = broken
      ? "On the real console, this second click would go ahead despite the Violation. This page sends nothing."
      : "You clicked Create. This page sends nothing.";
  });

  reset.addEventListener("click", () => {
    dbId.value = "";
    const production = root.querySelector<HTMLInputElement>('[name="db-mode"][value="production"]');
    if (production) production.checked = true;
    held = false;
    idField.classList.remove("highlight", "motion-pulse");
    createResult.textContent = "The last click is yours.";
    setMode("guide");
    caption.textContent = "Press Show the Step to start.";
  });
}
