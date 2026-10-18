// The side panel's Goal list: pick one to start it; "New goal" stops it and returns here.
export type Goal =
  | { kind: "journey"; id: string; title: string; summary: string }
  | { kind: "playbook"; id: string; title: string; summary: string; startUrl: string; prompt: string };

// Firestore is the compiled, cited Journey; the rest are Guide Playbooks from seed/playbooks.
export const GOALS: readonly Goal[] = [
  { kind: "journey", id: "firestore", title: "Create a Firestore database", summary: "Cited Journey · Firebase console" },
  { kind: "playbook", id: "view-cloud-run-logs", title: "View Cloud Run service logs", summary: "Playbook · Cloud console · read-only",
    startUrl: "https://console.cloud.google.com/run", prompt: "Guide me to view the logs of one of my Cloud Run services." },
  { kind: "playbook", id: "add-firebase-hosting-custom-domain", title: "Add a Firebase Hosting custom domain", summary: "Playbook · Firebase console · stops before Verify",
    startUrl: "https://console.firebase.google.com/", prompt: "Guide me to add a custom domain to my Firebase Hosting site. Stop before Verify." },
  { kind: "playbook", id: "create-cloud-storage-bucket", title: "Create a Cloud Storage bucket", summary: "Playbook · Cloud console · you click Create",
    startUrl: "https://console.cloud.google.com/storage/create-bucket", prompt: "Guide me to create a Cloud Storage bucket. I click Create myself." },
];

export function mountGoalPicker(container: HTMLElement, options: { start: (goal: Goal) => Promise<void>; stop: (goal: Goal) => void; goals?: readonly Goal[] }) {
  const goals = options.goals ?? GOALS;
  container.innerHTML = `<div data-list><h2>Pick a goal</h2><ul class="goal-list"></ul><p data-error role="alert" hidden></p></div>
    <div data-running class="goal-running" hidden><strong data-title></strong>
      <button type="button" data-new class="new-goal" title="Stop this goal and pick another"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg><span>New goal</span></button></div>`;
  const list = container.querySelector<HTMLElement>("[data-list]")!;
  const running = container.querySelector<HTMLElement>("[data-running]")!;
  const title = container.querySelector<HTMLElement>("[data-title]")!;
  const error = container.querySelector<HTMLElement>("[data-error]")!;
  const items = container.querySelector<HTMLElement>("ul")!;
  let current: Goal | undefined;
  let enabled = true;
  const buttons = goals.map((goal) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button"; button.dataset.goal = goal.id;
    const name = document.createElement("strong"); name.textContent = goal.title;
    const summary = document.createElement("span"); summary.textContent = goal.summary;
    button.append(name, summary);
    button.addEventListener("click", () => void pick(goal));
    li.append(button); items.append(li);
    return button;
  });
  function render() {
    list.hidden = !!current; running.hidden = !current;
    title.textContent = current?.title ?? "";
    container.dataset.goal = current?.id ?? "";
    buttons.forEach((b) => { b.disabled = !enabled; });
  }
  async function pick(goal: Goal) {
    if (!enabled || current) return;
    error.hidden = true;
    current = goal; render();
    try { await options.start(goal); }
    catch (e) {
      if (current !== goal) return;
      current = undefined; render();
      error.textContent = e instanceof Error ? e.message : "Couldn't start that goal.";
      error.hidden = false;
    }
  }
  function reset() {
    const goal = current;
    if (!goal) return;
    current = undefined; render();
    options.stop(goal);
  }
  container.querySelector<HTMLButtonElement>("[data-new]")!.addEventListener("click", reset);
  render();
  return {
    pick, reset,
    get current() { return current; },
    setEnabled(value: boolean) { enabled = value; render(); },
  };
}
