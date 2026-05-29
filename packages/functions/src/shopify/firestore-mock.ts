// In-memory Firestore stub for unit tests.

type DocData = Record<string, unknown>;

class MockDocRef {
  data: DocData;
  readonly id: string;
  readonly path: string;
  private _exists: boolean;

  constructor(id: string, path: string, data: DocData, exists = false) {
    this.id = id;
    this.path = path;
    this.data = { ...data };
    this._exists = exists;
  }

  async get(): Promise<{ exists: boolean; data(): DocData; ref: MockDocRef }> {
    return { exists: this._exists, data: () => this.data, ref: this };
  }

  async update(updates: DocData): Promise<void> {
    Object.assign(this.data, updates);
    this._exists = true;
  }

  async set(data: DocData): Promise<void> {
    this.data = { ...data };
    this._exists = true;
  }
}

class MockQuerySnapshot {
  docs: Array<{ id: string; ref: MockDocRef; data(): DocData }>;
  readonly empty: boolean;

  constructor(docs: MockDocRef[]) {
    this.docs = docs.map((ref) => ({
      id: ref.id,
      ref,
      data: () => ref.data,
    }));
    this.empty = docs.length === 0;
  }
}

class MockQuery {
  private docs: MockDocRef[];
  private filters: Array<(doc: DocData) => boolean> = [];
  private limitCount = Infinity;

  constructor(docs: MockDocRef[]) {
    this.docs = docs;
  }

  where(field: string, op: "==" | "!=" | ">" | "<", value: unknown): this {
    if (op === "==") this.filters.push((d) => d[field] === value);
    return this;
  }

  limit(n: number): this {
    this.limitCount = n;
    return this;
  }

  async get(): Promise<MockQuerySnapshot> {
    const matched = this.docs
      .filter((doc) => this.filters.every((f) => f(doc.data)))
      .slice(0, this.limitCount);
    return new MockQuerySnapshot(matched);
  }
}

class MockCollectionRef {
  private store: Map<string, MockDocRef>;
  private collectionPath: string;

  constructor(store: Map<string, MockDocRef>, path: string) {
    this.store = store;
    this.collectionPath = path;
  }

  doc(id: string): MockDocRef {
    if (!this.store.has(id)) {
      // Non-existent doc — exists=false until set/update is called
      const ref = new MockDocRef(id, `${this.collectionPath}/${id}`, {}, false);
      this.store.set(id, ref);
    }
    return this.store.get(id)!;
  }

  where(field: string, op: "==" | "!=" | ">" | "<", value: unknown): MockQuery {
    return new MockQuery([...this.store.values()]).where(field, op, value);
  }

  limit(n: number): MockQuery {
    return new MockQuery([...this.store.values()]).limit(n);
  }

  async get(): Promise<MockQuerySnapshot> {
    return new MockQuerySnapshot([...this.store.values()]);
  }

  async add(data: DocData): Promise<MockDocRef> {
    const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ref = new MockDocRef(id, `${this.collectionPath}/${id}`, data);
    this.store.set(id, ref);
    return ref;
  }
}

export class MockFirestore {
  private collections = new Map<string, Map<string, MockDocRef>>();

  collection(path: string): MockCollectionRef {
    if (!this.collections.has(path)) {
      this.collections.set(path, new Map());
    }
    return new MockCollectionRef(this.collections.get(path)!, path);
  }

  // Seed a document into a collection for test setup
  seed(collectionPath: string, id: string, data: DocData): MockDocRef {
    if (!this.collections.has(collectionPath)) {
      this.collections.set(collectionPath, new Map());
    }
    const ref = new MockDocRef(id, `${collectionPath}/${id}`, data, true);
    this.collections.get(collectionPath)!.set(id, ref);
    return ref;
  }

  // Read back all docs in a collection
  docs(collectionPath: string): DocData[] {
    return [...(this.collections.get(collectionPath)?.values() ?? [])].map(
      (r) => r.data
    );
  }

  // Read back a single doc by id
  doc(collectionPath: string, id: string): DocData | undefined {
    return this.collections.get(collectionPath)?.get(id)?.data;
  }
}
