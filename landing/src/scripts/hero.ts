import { animate } from "motion/mini";
import { hero } from "../content/guiderail";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

type Phase = keyof typeof hero.captions;

type Playback = { stop: () => void };

const reduceQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");

function prefersReduce(): boolean {
  return reduceQuery().matches;
}

export function startHero(root: HTMLElement): void {
  const plate = root.querySelector("[data-plate]");
  const caption = root.querySelector("[data-caption]");
  const owner = root.querySelector("[data-owner]");
  const verdict = root.querySelector("[data-verdict]");
  const policy = root.querySelector("[data-policy]");
  const path = root.querySelector("[data-rail]");
  const svg = root.querySelector("[data-rail-svg]");
  const from = root.querySelector("[data-from]");
  const to = root.querySelector("[data-to]");
  const beats = root.querySelector("[data-beats]");

  if (
    !(plate instanceof HTMLElement) ||
    !(caption instanceof HTMLElement) ||
    !(owner instanceof HTMLElement) ||
    !(verdict instanceof HTMLElement) ||
    !(policy instanceof HTMLElement) ||
    !(path instanceof SVGPathElement) ||
    !(svg instanceof SVGSVGElement) ||
    !(from instanceof HTMLElement) ||
    !(to instanceof HTMLButtonElement) ||
    !(beats instanceof HTMLOListElement)
  ) {
    return;
  }

  const showBtn = button(root, "show");
  const policyBtn = button(root, "policy");
  const badBtn = button(root, "bad");
  const fixBtn = button(root, "fix");
  const saveBtn = button(root, "save");
  const resetBtn = button(root, "reset");
  const detailsBtn = root.querySelector("[data-panel-button='details']");
  const labelsBtn = to;
  if (
    !showBtn ||
    !policyBtn ||
    !badBtn ||
    !fixBtn ||
    !saveBtn ||
    !resetBtn ||
    !(detailsBtn instanceof HTMLButtonElement)
  ) {
    return;
  }

  let phase: Phase = "ready";
  let saveStrikes = 0;
  let playing: Playback | null = null;
  let railOn = false;

  const setCaption = (text: string) => {
    caption.textContent = text;
  };

  const markBeat = (name: Phase) => {
    const beatFor: Record<Phase, number> = {
      ready: 0,
      shown: 1,
      labels: 1,
      policy: 2,
      violation: 3,
      corrected: 4,
    };
    const current = beatFor[name];
    beats.querySelectorAll("li").forEach((item, i) => {
      if (i === current) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  };

  const setPhase = (next: Phase) => {
    phase = next;
    setCaption(hero.captions[next]);
    markBeat(next);
  };

  const showPanel = (name: "details" | "labels", animateIn: boolean) => {
    root.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
      const on = panel.dataset.panel === name;
      panel.hidden = !on;
      if (on && animateIn && !prefersReduce()) {
        animate(panel, { opacity: [0, 1] }, { duration: 0.22, ease: EASE });
      }
    });
    detailsBtn.setAttribute("aria-pressed", name === "details" ? "true" : "false");
    labelsBtn.setAttribute("aria-pressed", name === "labels" ? "true" : "false");
  };

  const drawRail = (animateDraw: boolean) => {
    const box = plate.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = labelsBtn.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - box.left;
    const y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left + b.width / 2 - box.left;
    const yLane = b.bottom - box.top + 7;
    const yTip = b.bottom - box.top - 1;
    path.setAttribute(
      "d",
      `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x1.toFixed(1)} ${yLane.toFixed(1)} L ${x2.toFixed(1)} ${yLane.toFixed(1)} L ${x2.toFixed(1)} ${yTip.toFixed(1)}`,
    );
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    playing?.stop();
    playing = null;
    railOn = true;
    if (!animateDraw || prefersReduce() || length === 0) {
      path.style.strokeDashoffset = "0";
      return;
    }
    path.style.strokeDashoffset = `${length}`;
    const controls = animate(
      path,
      { strokeDashoffset: [length, 0] },
      { duration: 0.7, ease: EASE },
    ) as Playback;
    playing = controls;
  };

  showBtn.addEventListener("click", () => {
    if (phase !== "ready") return;
    showBtn.disabled = true;
    showBtn.textContent = hero.actions.shown;
    labelsBtn.disabled = false;
    labelsBtn.classList.add("is-hot");
    setPhase("shown");
    drawRail(true);
    labelsBtn.focus();
  });

  detailsBtn.addEventListener("click", () => {
    showPanel("details", false);
  });

  labelsBtn.addEventListener("click", () => {
    if (labelsBtn.disabled) return;
    showPanel("labels", true);
    labelsBtn.classList.remove("is-hot");
    if (phase === "ready" || phase === "shown") {
      policyBtn.disabled = false;
      badBtn.disabled = false;
      setPhase("labels");
    }
  });

  policyBtn.addEventListener("click", () => {
    policy.hidden = false;
    policyBtn.disabled = true;
    policyBtn.textContent = hero.actions.policyOpen;
    if (phase === "labels" || phase === "shown") setPhase("policy");
  });

  badBtn.addEventListener("click", () => {
    owner.textContent = hero.badOwner;
    verdict.hidden = false;
    verdict.dataset.kind = "bad";
    verdict.textContent = hero.violation;
    badBtn.disabled = true;
    fixBtn.disabled = false;
    saveBtn.disabled = false;
    saveStrikes = 0;
    setPhase("violation");
  });

  fixBtn.addEventListener("click", () => {
    owner.textContent = hero.goodOwner;
    verdict.hidden = false;
    verdict.dataset.kind = "ok";
    verdict.textContent = hero.matched;
    fixBtn.disabled = true;
    saveBtn.disabled = false;
    saveStrikes = 0;
    setPhase("corrected");
  });

  saveBtn.addEventListener("click", () => {
    if (phase === "violation") {
      saveStrikes += 1;
      setCaption(saveStrikes === 1 ? hero.save.held : hero.save.second);
      return;
    }
    if (phase === "corrected") setCaption(hero.save.ok);
  });

  resetBtn.addEventListener("click", () => {
    playing?.stop();
    playing = null;
    railOn = false;
    path.setAttribute("d", "");
    path.style.strokeDashoffset = "0";
    phase = "ready";
    saveStrikes = 0;
    owner.textContent = hero.emptyOwner;
    verdict.hidden = true;
    verdict.textContent = "";
    delete verdict.dataset.kind;
    policy.hidden = true;
    labelsBtn.disabled = true;
    labelsBtn.classList.remove("is-hot");
    showBtn.disabled = false;
    showBtn.textContent = hero.actions.show;
    policyBtn.disabled = true;
    policyBtn.textContent = hero.actions.policy;
    badBtn.disabled = true;
    fixBtn.disabled = true;
    saveBtn.disabled = true;
    showPanel("details", false);
    setPhase("ready");
    showBtn.focus();
  });

  const onResize = () => {
    if (railOn) drawRail(false);
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(plate);
  reduceQuery().addEventListener("change", onResize);

  markBeat("ready");
}

function button(root: ParentNode, action: string): HTMLButtonElement | null {
  const el = root.querySelector(`[data-action="${action}"]`);
  return el instanceof HTMLButtonElement ? el : null;
}
