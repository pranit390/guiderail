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
};
