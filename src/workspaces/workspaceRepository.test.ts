import { describe, expect, it } from 'vitest';
import {
  InMemoryPreferencesRepository,
  InMemoryWorkspaceRepository,
} from './inMemoryWorkspaceRepository';
import { IndexedDbConnection, IndexedDbWorkspaceRepository } from './indexedDbWorkspaceRepository';
import { StorageError } from './workspaceRepository';
import { createDefaultWorkspace } from './workspaceDefaults';

describe('workspace repository abstraction', () => {
  it('manages workspace lifecycle in memory', async () => {
    const repo = new InMemoryWorkspaceRepository();

    const ws1 = createDefaultWorkspace('ws-1');
    ws1.title = 'Comparison Alpha';
    ws1.updatedAt = '2026-11-10T10:00:00.000Z';
    ws1.lastOpenedAt = '2026-11-10T10:00:00.000Z';
    await repo.create(ws1);

    const ws2 = createDefaultWorkspace('ws-2');
    ws2.title = 'Comparison Beta';
    ws2.updatedAt = '2026-11-11T12:00:00.000Z';
    ws2.lastOpenedAt = '2026-11-11T12:00:00.000Z';
    await repo.create(ws2);

    const list = await repo.listRecent();
    expect(list.length).toBe(2);
    // Beta was opened more recently, so it should be first
    expect(list[0]?.id).toBe('ws-2');
    expect(list[1]?.id).toBe('ws-1');

    // Update Alpha
    ws1.lastOpenedAt = '2026-11-12T09:00:00.000Z';
    await repo.update(ws1);

    const listAfterUpdate = await repo.listRecent();
    expect(listAfterUpdate[0]?.id).toBe('ws-1');

    // Limit
    const limited = await repo.listRecent(1);
    expect(limited.length).toBe(1);
    expect(limited[0]?.id).toBe('ws-1');

    // Get by ID
    const fetched = await repo.getById('ws-2');
    expect(fetched?.title).toBe('Comparison Beta');

    // Delete
    await repo.deleteById('ws-2');
    expect(await repo.getById('ws-2')).toBeNull();

    // Clear
    await repo.clearAll();
    expect(await repo.listRecent()).toEqual([]);
  });

  it('manages local preferences in memory', async () => {
    const prefRepo = new InMemoryPreferencesRepository();
    const initial = await prefRepo.get();
    expect(initial.motionPreference).toBe('system');
    expect(initial.defaultCrossfadeMs).toBe(180);
    expect(initial.defaultPresentationLayout).toBe('standard');

    const updated = await prefRepo.update({
      motionPreference: 'reduced',
      defaultCrossfadeMs: 240,
    });
    expect(updated.motionPreference).toBe('reduced');
    expect(updated.defaultCrossfadeMs).toBe(240);
    expect(updated.defaultPresentationLayout).toBe('standard');

    await prefRepo.reset();
    const resetPrefs = await prefRepo.get();
    expect(resetPrefs.motionPreference).toBe('system');
  });

  it('rejects prohibited properties when saving', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-bad');
    (ws as unknown as Record<string, unknown>).audioBuffer = { length: 100 };

    await expect(repo.create(ws)).rejects.toThrow(/Prohibited property "audioBuffer"/);
  });

  it('properly classifies StorageError instances', () => {
    const error = new StorageError('quota', 'Storage full');
    expect(error.name).toBe('StorageError');
    expect(error.kind).toBe('quota');
    expect(error.message).toBe('Storage full');
  });

  it('IndexedDbConnection handles unavailable indexedDB environment gracefully', async () => {
    // In this jsdom environment without indexedDB, IndexedDbConnection throws typed unavailable error
    const connection = new IndexedDbConnection(undefined);
    expect(connection.isSupported()).toBe(false);

    const repo = new IndexedDbWorkspaceRepository(connection);
    await expect(repo.listRecent()).rejects.toThrow(StorageError);
  });
});
