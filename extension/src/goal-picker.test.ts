// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOALS, mountGoalPicker } from "./goal-picker.ts";

afterEach(() => { document.body.replaceChildren(); });
function mount(start = vi.fn().mockResolvedValue(undefined)) {
  const container = document.createElement("section"); document.body.append(container);
  const stop = vi.fn();
  const picker = mountGoalPicker(container, { start, stop });
  const goal = (id: string) => container.querySelector<HTMLButtonElement>(`[data-goal="${id}"]`)!;
  return { container, start, stop, picker, goal, newGoal: container.querySelector<HTMLButtonElement>("[data-new]")! };
}
describe("Goal picker", () => {
  it("lists the Firestore Journey first, then Playbook goals", () => {
    const { container } = mount();
    const titles = [...container.querySelectorAll(".goal-list strong")].map((el) => el.textContent);
    expect(titles).toEqual(GOALS.map((g) => g.title));
    expect(GOALS[0].kind).toBe("journey");
    expect(GOALS.filter((g) => g.kind === "playbook")).toHaveLength(3);
  });
  it("starts a goal on select and shows only its slim header", async () => {
    const { container, start, goal, picker } = mount();
    goal("create-cloud-storage-bucket").click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(GOALS[3]));
    expect(picker.current).toBe(GOALS[3]);
    expect(container.querySelector<HTMLElement>("[data-list]")!.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>("[data-running]")!.hidden).toBe(false);
    expect(container.querySelector("[data-title]")!.textContent).toBe("Create a Cloud Storage bucket");
  });
  it("New goal stops the running goal and returns to the list", async () => {
    const { container, start, stop, goal, newGoal, picker } = mount();
    goal("firestore").click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    newGoal.click();
    expect(stop).toHaveBeenCalledWith(GOALS[0]);
    expect(picker.current).toBeUndefined();
    expect(container.querySelector<HTMLElement>("[data-list]")!.hidden).toBe(false);
    goal("view-cloud-run-logs").click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  });
  it("returns to the list with the reason when a goal can't start", async () => {
    const { container, goal, picker } = mount(vi.fn().mockRejectedValue(new Error("Turn off Learn mode before starting a Journey.")));
    goal("firestore").click();
    await vi.waitFor(() => expect(container.querySelector("[data-error]")!.textContent).toContain("Learn mode"));
    expect(picker.current).toBeUndefined();
    expect(container.querySelector<HTMLElement>("[data-list]")!.hidden).toBe(false);
  });
  it("ignores picks while disabled", () => {
    const { start, goal, picker } = mount();
    picker.setEnabled(false);
    goal("firestore").click();
    expect(start).not.toHaveBeenCalled();
    expect(goal("firestore").disabled).toBe(true);
  });
});
