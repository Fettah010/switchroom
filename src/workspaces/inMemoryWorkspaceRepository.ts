import { DEFAULT_PREFERENCES } from './workspaceDefaults';
import type { LocalPreferencesRepository, LocalWorkspaceRepository } from './workspaceRepository';
import type { LocalPreferences, WorkspaceRecord } from './workspaceTypes';
import {
  assertNoProhibitedProperties,
  validateLocalPreferences,
  validateWorkspaceRecord,
} from './workspaceValidation';

export class InMemoryWorkspaceRepository implements LocalWorkspaceRepository {
  private records = new Map<string, WorkspaceRecord>();

  async listRecent(limit?: number): Promise<WorkspaceRecord[]> {
    const list = Array.from(this.records.values());
    list.sort((a, b) => {
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
      return list.slice(0, limit);
    }
    return list;
  }

  async getById(id: string): Promise<WorkspaceRecord | null> {
    const found = this.records.get(id);
    return found ? { ...found } : null;
  }

  async create(record: WorkspaceRecord): Promise<void> {
    assertNoProhibitedProperties(record, 'create');
    const validated = validateWorkspaceRecord(record);
    if (!validated.valid || !validated.value) {
      throw new Error(`Invalid workspace record: ${validated.errors.join(', ')}`);
    }
    this.records.set(record.id, { ...validated.value });
  }

  async update(record: WorkspaceRecord): Promise<void> {
    assertNoProhibitedProperties(record, 'update');
    const validated = validateWorkspaceRecord(record);
    if (!validated.valid || !validated.value) {
      throw new Error(`Invalid workspace record: ${validated.errors.join(', ')}`);
    }
    this.records.set(record.id, { ...validated.value });
  }

  async deleteById(id: string): Promise<void> {
    this.records.delete(id);
  }

  async clearAll(): Promise<void> {
    this.records.clear();
  }
}

export class InMemoryPreferencesRepository implements LocalPreferencesRepository {
  private prefs: LocalPreferences = { ...DEFAULT_PREFERENCES };

  async get(): Promise<LocalPreferences> {
    return { ...this.prefs };
  }

  async update(patch: Partial<LocalPreferences>): Promise<LocalPreferences> {
    const merged = { ...this.prefs, ...patch };
    const validated = validateLocalPreferences(merged);
    this.prefs = validated.value;
    return { ...this.prefs };
  }

  async reset(): Promise<void> {
    this.prefs = { ...DEFAULT_PREFERENCES };
  }
}
