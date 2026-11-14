import { DEFAULT_PREFERENCES } from './workspaceDefaults';
import {
  StorageError,
  type LocalPreferencesRepository,
  type LocalWorkspaceRepository,
} from './workspaceRepository';
import type { LocalPreferences, WorkspaceRecord } from './workspaceTypes';
import {
  assertNoProhibitedProperties,
  validateLocalPreferences,
  validateWorkspaceRecord,
} from './workspaceValidation';

export const SWITCHROOM_DB_NAME = 'switchroom-local';
export const SWITCHROOM_DB_VERSION = 1;
export const WORKSPACES_STORE = 'workspaces';
export const PREFERENCES_STORE = 'preferences';
const PREFERENCES_DOC_KEY = 'global_preferences';

function getIndexedDbFactory(): IDBFactory | null {
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      return window.indexedDB;
    }
    if (typeof indexedDB !== 'undefined') {
      return indexedDB;
    }
  } catch {
    return null;
  }
  return null;
}

export class IndexedDbConnection {
  private static instance: IndexedDbConnection | null = null;
  private db: IDBDatabase | null = null;
  private openingPromise: Promise<IDBDatabase> | null = null;
  private factory: IDBFactory | null = null;

  constructor(customFactory?: IDBFactory) {
    this.factory = customFactory ?? getIndexedDbFactory();
  }

  static getDefault(): IndexedDbConnection {
    if (!IndexedDbConnection.instance) {
      IndexedDbConnection.instance = new IndexedDbConnection();
    }
    return IndexedDbConnection.instance;
  }

  isSupported(): boolean {
    return Boolean(this.factory ?? getIndexedDbFactory());
  }

  async getDb(): Promise<IDBDatabase> {
    const factory = this.factory ?? getIndexedDbFactory();
    if (!factory) {
      throw new StorageError(
        'unavailable',
        'IndexedDB is not available or blocked in this browser environment.',
      );
    }

    if (this.db) {
      return this.db;
    }

    if (this.openingPromise) {
      return this.openingPromise;
    }

    this.openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(SWITCHROOM_DB_NAME, SWITCHROOM_DB_VERSION);
      } catch (err) {
        this.openingPromise = null;
        reject(
          new StorageError(
            'unavailable',
            'Could not open IndexedDB due to security or browser policy.',
            err,
          ),
        );
        return;
      }

      request.onblocked = (evt) => {
        reject(
          new StorageError(
            'blocked',
            'IndexedDB upgrade is blocked by another open tab or window.',
            evt,
          ),
        );
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          // Schema Version 1
          if (!db.objectStoreNames.contains(WORKSPACES_STORE)) {
            const store = db.createObjectStore(WORKSPACES_STORE, { keyPath: 'id' });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
            store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
          }

          if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
            db.createObjectStore(PREFERENCES_STORE, { keyPath: 'key' });
          }
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        this.db = db;
        this.openingPromise = null;

        db.onversionchange = () => {
          db.close();
          this.db = null;
        };

        db.onclose = () => {
          this.db = null;
        };

        resolve(db);
      };

      request.onerror = () => {
        this.openingPromise = null;
        reject(
          new StorageError(
            'read',
            `IndexedDB open failed: ${request.error?.message ?? 'Unknown error'}`,
            request.error,
          ),
        );
      };
    });

    return this.openingPromise;
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore
      }
      this.db = null;
    }
    this.openingPromise = null;
  }
}

export class IndexedDbWorkspaceRepository implements LocalWorkspaceRepository {
  constructor(private connection = IndexedDbConnection.getDefault()) {}

  async listRecent(limit?: number): Promise<WorkspaceRecord[]> {
    const db = await this.connection.getDb();

    return new Promise<WorkspaceRecord[]>((resolve, reject) => {
      try {
        const tx = db.transaction([WORKSPACES_STORE], 'readonly');
        const store = tx.objectStore(WORKSPACES_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          const rawItems = (request.result ?? []) as unknown[];
          const validRecords: WorkspaceRecord[] = [];

          for (const item of rawItems) {
            const res = validateWorkspaceRecord(item);
            if (res.valid && res.value) {
              validRecords.push(res.value);
            }
          }

          // Sort by lastOpenedAt descending, then updatedAt descending
          validRecords.sort((a, b) => {
            const aOpened = Date.parse(a.lastOpenedAt) || 0;
            const bOpened = Date.parse(b.lastOpenedAt) || 0;
            if (bOpened !== aOpened) {
              return bOpened - aOpened;
            }
            const aUpdated = Date.parse(a.updatedAt) || 0;
            const bUpdated = Date.parse(b.updatedAt) || 0;
            return bUpdated - aUpdated;
          });

          if (typeof limit === 'number' && limit > 0) {
            resolve(validRecords.slice(0, limit));
          } else {
            resolve(validRecords);
          }
        };

        request.onerror = () => {
          reject(
            new StorageError(
              'read',
              `Could not read workspaces: ${request.error?.message ?? 'Unknown error'}`,
              request.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('read', 'Failed to start workspace list transaction', err));
      }
    });
  }

  async getById(id: string): Promise<WorkspaceRecord | null> {
    const db = await this.connection.getDb();

    return new Promise<WorkspaceRecord | null>((resolve, reject) => {
      try {
        const tx = db.transaction([WORKSPACES_STORE], 'readonly');
        const store = tx.objectStore(WORKSPACES_STORE);
        const request = store.get(id);

        request.onsuccess = () => {
          const val = request.result;
          if (!val) {
            resolve(null);
            return;
          }

          const res = validateWorkspaceRecord(val);
          if (res.valid && res.value) {
            resolve(res.value);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          reject(
            new StorageError(
              'read',
              `Could not get workspace: ${request.error?.message ?? 'Unknown error'}`,
              request.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('read', `Failed to get workspace "${id}"`, err));
      }
    });
  }

  async create(record: WorkspaceRecord): Promise<void> {
    return this.saveRecord(record, 'create');
  }

  async update(record: WorkspaceRecord): Promise<void> {
    return this.saveRecord(record, 'update');
  }

  private async saveRecord(record: WorkspaceRecord, action: 'create' | 'update'): Promise<void> {
    assertNoProhibitedProperties(record, action);
    const validated = validateWorkspaceRecord(record);
    if (!validated.valid || !validated.value) {
      throw new StorageError(
        'corrupt',
        `Cannot save invalid workspace: ${validated.errors.join(', ')}`,
      );
    }

    const db = await this.connection.getDb();

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([WORKSPACES_STORE], 'readwrite');
        const store = tx.objectStore(WORKSPACES_STORE);
        store.put(validated.value);

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          const err = tx.error;
          if (err?.name === 'QuotaExceededError') {
            reject(
              new StorageError(
                'quota',
                'Local browser storage quota exceeded. Please clear old workspaces.',
                err,
              ),
            );
          } else {
            reject(
              new StorageError(
                'write',
                `Failed to save workspace: ${err?.message ?? 'Transaction error'}`,
                err,
              ),
            );
          }
        };

        tx.onabort = () => {
          reject(
            new StorageError(
              'write',
              `Transaction was aborted while saving workspace: ${tx.error?.message ?? 'Aborted'}`,
              tx.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('write', 'Failed to initiate workspace write transaction', err));
      }
    });
  }

  async deleteById(id: string): Promise<void> {
    const db = await this.connection.getDb();

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([WORKSPACES_STORE], 'readwrite');
        const store = tx.objectStore(WORKSPACES_STORE);
        store.delete(id);

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          reject(
            new StorageError(
              'write',
              `Failed to delete workspace: ${tx.error?.message ?? 'Transaction error'}`,
              tx.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('write', `Failed to delete workspace "${id}"`, err));
      }
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.connection.getDb();

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([WORKSPACES_STORE], 'readwrite');
        const store = tx.objectStore(WORKSPACES_STORE);
        store.clear();

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          reject(
            new StorageError(
              'write',
              `Failed to clear workspaces: ${tx.error?.message ?? 'Transaction error'}`,
              tx.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('write', 'Failed to clear workspaces', err));
      }
    });
  }
}

export class IndexedDbPreferencesRepository implements LocalPreferencesRepository {
  constructor(private connection = IndexedDbConnection.getDefault()) {}

  async get(): Promise<LocalPreferences> {
    try {
      const db = await this.connection.getDb();

      return new Promise<LocalPreferences>((resolve) => {
        try {
          const tx = db.transaction([PREFERENCES_STORE], 'readonly');
          const store = tx.objectStore(PREFERENCES_STORE);
          const request = store.get(PREFERENCES_DOC_KEY);

          request.onsuccess = () => {
            const raw = request.result as { key?: string; preferences?: unknown } | undefined;
            if (!raw || !raw.preferences) {
              resolve({ ...DEFAULT_PREFERENCES });
              return;
            }
            const validated = validateLocalPreferences(raw.preferences);
            resolve(validated.value);
          };

          request.onerror = () => {
            resolve({ ...DEFAULT_PREFERENCES });
          };
        } catch {
          resolve({ ...DEFAULT_PREFERENCES });
        }
      });
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  async update(patch: Partial<LocalPreferences>): Promise<LocalPreferences> {
    const current = await this.get();
    const merged = { ...current, ...patch };
    const validated = validateLocalPreferences(merged);

    const db = await this.connection.getDb();

    return new Promise<LocalPreferences>((resolve, reject) => {
      try {
        const tx = db.transaction([PREFERENCES_STORE], 'readwrite');
        const store = tx.objectStore(PREFERENCES_STORE);
        store.put({ key: PREFERENCES_DOC_KEY, preferences: validated.value });

        tx.oncomplete = () => {
          resolve(validated.value);
        };

        tx.onerror = () => {
          reject(
            new StorageError(
              'write',
              `Failed to save preferences: ${tx.error?.message ?? 'Transaction error'}`,
              tx.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('write', 'Failed to initiate preferences write transaction', err));
      }
    });
  }

  async reset(): Promise<void> {
    const db = await this.connection.getDb();

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([PREFERENCES_STORE], 'readwrite');
        const store = tx.objectStore(PREFERENCES_STORE);
        store.delete(PREFERENCES_DOC_KEY);

        tx.oncomplete = () => {
          resolve();
        };

        tx.onerror = () => {
          reject(
            new StorageError(
              'write',
              `Failed to reset preferences: ${tx.error?.message ?? 'Transaction error'}`,
              tx.error,
            ),
          );
        };
      } catch (err) {
        reject(new StorageError('write', 'Failed to reset preferences', err));
      }
    });
  }
}

/**
 * Scoped reset of all local Switchroom storage:
 * 1. Clears all workspace records in IndexedDB.
 * 2. Resets IndexedDB preferences to defaults.
 * 3. Resets only Switchroom's localStorage theme key ('switchroom.theme') to 'system'.
 * Does not touch unrelated browser storage or origin cache.
 */
export async function clearAllLocalSwitchroomData(
  connection = IndexedDbConnection.getDefault(),
): Promise<void> {
  const wsRepo = new IndexedDbWorkspaceRepository(connection);
  const prefRepo = new IndexedDbPreferencesRepository(connection);

  await wsRepo.clearAll();
  await prefRepo.reset();

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('switchroom.theme', 'system');
    } catch {
      // ignore
    }
  }
}
