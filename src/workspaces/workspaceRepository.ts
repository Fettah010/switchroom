import type { LocalPreferences, WorkspaceRecord } from './workspaceTypes';

export type StorageErrorKind =
  'unavailable' | 'blocked' | 'quota' | 'read' | 'write' | 'corrupt' | 'not_found';

export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  readonly causeError?: unknown;

  constructor(kind: StorageErrorKind, message: string, causeError?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
    this.causeError = causeError;
  }
}

export interface LocalWorkspaceRepository {
  listRecent(limit?: number): Promise<WorkspaceRecord[]>;
  getById(id: string): Promise<WorkspaceRecord | null>;
  create(record: WorkspaceRecord): Promise<void>;
  update(record: WorkspaceRecord): Promise<void>;
  deleteById(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface LocalPreferencesRepository {
  get(): Promise<LocalPreferences>;
  update(patch: Partial<LocalPreferences>): Promise<LocalPreferences>;
  reset(): Promise<void>;
}
