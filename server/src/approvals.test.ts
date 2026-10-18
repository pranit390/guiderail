import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approvals, MemoryApprovalStore, requestApproval } from "./approvals.ts";

const request = { requester: "ana@example.com", role: "roles/run.developer", resource: "demo-project", reason: "Deploy the demo" };

beforeEach(() => {
  vi.stubEnv("PUBLIC_ORIGIN", undefined);
  vi.stubEnv("K_SERVICE", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("approval links", () => {
  it("uses the configured public origin", async () => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://coach.example");
    vi.stubEnv("K_SERVICE", "guiderail-coach");
    const result = await requestApproval(request);
    if (!("url" in result)) throw new Error(result.error);
    expect(result.url).toBe(`https://coach.example/a/${result.id}`);
    expect(await approvals.get(result.id)).toMatchObject({ ...request, status: "pending" });
  });

  it("fails closed on Cloud Run without a public origin", async () => {
    vi.stubEnv("K_SERVICE", "guiderail-coach");
    const create = vi.spyOn(approvals, "create");
    expect(await requestApproval(request)).toEqual({ error: expect.stringContaining("PUBLIC_ORIGIN") });
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it.each(["http://coach.example", "https://coach.example/path"])("never falls back to localhost for an invalid PUBLIC_ORIGIN %j", async (value) => {
    vi.stubEnv("PUBLIC_ORIGIN", value);
    expect(await requestApproval(request)).toEqual({ error: expect.stringContaining("PUBLIC_ORIGIN") });
  });

  it("links to localhost only for local development", async () => {
    vi.stubEnv("PORT", "8787");
    const result = await requestApproval(request);
    expect(result).toMatchObject({ url: expect.stringMatching(/^http:\/\/localhost:8787\/a\/apr_/) });
  });
});

describe("approval store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("bounds open requests and field sizes, and frees expired requests", async () => {
    const store = new MemoryApprovalStore();
    const first = await store.create({ ...request, reason: "x".repeat(10_000) });
    expect(first?.reason).toHaveLength(500);
    for (let i = 1; i < 100; i++) expect(await store.create(request)).toBeDefined();
    expect(await store.create(request)).toBeUndefined();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(await store.create(request)).toBeDefined();
  });
});
