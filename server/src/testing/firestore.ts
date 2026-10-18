// Minimal, in-memory Admin Firestore API for contract tests when no emulator is configured.
type Body = Record<string, unknown>;
const documents = new Map<string, Body>();
const snapshot = (path: string) => ({
  id: path.split("/").at(-1),
  exists: documents.has(path),
  data: () => structuredClone(documents.get(path)),
});
const reference = (path: string) => ({
  path,
  get: async () => snapshot(path),
  set: async (body: Body) => { documents.set(path, structuredClone(body)); },
});

export const fakeFirestore = {
  documents,
  collection: (name: string) => ({
    doc: (id: string) => reference(`${name}/${id}`),
    get: async () => ({ docs: [...documents.keys()].filter((path) => path.startsWith(`${name}/`)).sort().map(snapshot) }),
  }),
  runTransaction: async (work: (transaction: {
    get: (ref: ReturnType<typeof reference>) => Promise<ReturnType<typeof snapshot>>;
    set: (ref: ReturnType<typeof reference>, body: Body) => void;
  }) => Promise<void>) => {
    const pending = new Map<string, Body>();
    await work({
      get: async (ref) => snapshot(ref.path),
      set: (ref, body) => { pending.set(ref.path, structuredClone(body)); },
    });
    for (const [path, body] of pending) documents.set(path, body);
  },
};
