import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import type { ProjectRow } from '../types';
import {
  assertStorageQuotaAvailable,
  releaseStorageReservation,
  getStorageUsageSummary,
} from './storageQuota';
import { QUOTA_POLICY } from '../config/quotas';

class MockQuotaD1PreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private sql: string,
    private state: {
      globalCommitted: number;
      globalReserved: number;
      userCommitted: number;
      userReserved: number;
      projCommitted: number;
      projReserved: number;
      reservedSessions: Record<string, number>;
    },
  ) {}

  bind(...values: unknown[]) {
    this.bindings = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const norm = this.sql.replace(/\s+/g, ' ');

    if (norm.includes('WHERE p.owner_user_id = ?')) {
      return { committed: this.state.userCommitted, reserved: this.state.userReserved } as T;
    }

    if (norm.includes("WHERE project_id = ? AND status = 'ready'")) {
      return { committed: this.state.projCommitted, reserved: this.state.projReserved } as T;
    }

    if (norm.includes("FROM audio_assets WHERE status = 'ready'")) {
      return { committed: this.state.globalCommitted, reserved: this.state.globalReserved } as T;
    }

    return null;
  }

  async run(): Promise<{ success: boolean }> {
    const norm = this.sql.replace(/\s+/g, ' ');
    if (norm.startsWith('UPDATE upload_sessions SET reserved_bytes = 0')) {
      const [_now, id] = this.bindings;
      if (id && typeof id === 'string') {
        this.state.reservedSessions[id] = 0;
      }
    }
    return { success: true };
  }
}

class MockQuotaDb {
  state = {
    globalCommitted: 0,
    globalReserved: 0,
    userCommitted: 0,
    userReserved: 0,
    projCommitted: 0,
    projReserved: 0,
    reservedSessions: {} as Record<string, number>,
  };

  prepare(sql: string) {
    return new MockQuotaD1PreparedStatement(sql, this.state);
  }
}

describe('storageQuota service for Switchroom v0.7.0', () => {
  let db: MockQuotaDb;
  let guestProject: ProjectRow;
  let userProject: ProjectRow;

  beforeEach(() => {
    db = new MockQuotaDb();
    guestProject = {
      id: 'proj_guest',
      owner_user_id: null,
      owner_capability_hash: 'cap_hash',
      title: 'Guest Mix',
      description: '',
      status: 'ready',
      visibility: 'private',
      sharing_visibility: 'unlisted',
      retention_days: 30,
      crossfade_ms: 180,
      presentation_layout: 'standard',
      created_at: 1000,
      updated_at: 1000,
      expires_at: 2000,
      deleted_at: null,
      public_indexing_enabled: 0,
      password_hash: null,
      feedback_enabled: 1,
      downloads_enabled: 0,
    };

    userProject = {
      ...guestProject,
      id: 'proj_user',
      owner_user_id: 'user_123',
      owner_capability_hash: null,
    };
  });

  it('allows reservation when within budgets', async () => {
    db.state.globalCommitted = 100 * 1024 * 1024;
    db.state.globalReserved = 50 * 1024 * 1024;
    db.state.projCommitted = 20 * 1024 * 1024;
    db.state.projReserved = 0;

    await expect(
      assertStorageQuotaAvailable(db as unknown as D1Database, guestProject, 30 * 1024 * 1024),
    ).resolves.toBeUndefined();
  });

  it('blocks reservation when Switchroom aggregate budget would be exceeded', async () => {
    // 7.9 GB used of 8 GB budget
    db.state.globalCommitted = 7 * 1024 * 1024 * 1024;
    db.state.globalReserved = 950 * 1024 * 1024;

    // Attempting to reserve 200 MB exceeds 8 GB ceiling
    await expect(
      assertStorageQuotaAvailable(db as unknown as D1Database, guestProject, 200 * 1024 * 1024),
    ).rejects.toThrow(
      'Switchroom audio storage budget has been reached. Please try again later or contact the administrator.',
    );
  });

  it('blocks reservation when guest project storage quota (300 MB) is exceeded', async () => {
    db.state.projCommitted = 200 * 1024 * 1024;
    db.state.projReserved = 50 * 1024 * 1024;

    // 250 MB used + 60 MB requested = 310 MB > 300 MB
    await expect(
      assertStorageQuotaAvailable(db as unknown as D1Database, guestProject, 60 * 1024 * 1024),
    ).rejects.toThrow('Guest project storage quota exceeded');
  });

  it('blocks reservation when user storage quota (2 GB) is exceeded', async () => {
    db.state.userCommitted = 1800 * 1024 * 1024;
    db.state.userReserved = 150 * 1024 * 1024;

    // 1950 MB used + 100 MB requested = 2050 MB > 2048 MB
    await expect(
      assertStorageQuotaAvailable(db as unknown as D1Database, userProject, 100 * 1024 * 1024),
    ).rejects.toThrow('User storage quota exceeded');
  });

  it('releases storage reservation idempotently', async () => {
    db.state.reservedSessions['sess_abc'] = 50 * 1024 * 1024;
    await releaseStorageReservation(db as unknown as D1Database, 'sess_abc');
    expect(db.state.reservedSessions['sess_abc']).toBe(0);
  });

  it('computes accurate storage usage summary', async () => {
    db.state.globalCommitted = 500 * 1024 * 1024;
    db.state.globalReserved = 100 * 1024 * 1024;
    db.state.projCommitted = 50 * 1024 * 1024;
    db.state.projReserved = 25 * 1024 * 1024;

    const summary = await getStorageUsageSummary(db as unknown as D1Database, guestProject);
    expect(summary.committedBytes).toBe(50 * 1024 * 1024);
    expect(summary.reservedBytes).toBe(25 * 1024 * 1024);
    expect(summary.totalUsageBytes).toBe(75 * 1024 * 1024);
    expect(summary.limitBytes).toBe(QUOTA_POLICY.guestMaxStorageBytes);
    expect(summary.globalTotalBytes).toBe(600 * 1024 * 1024);
    expect(summary.globalBudgetBytes).toBe(QUOTA_POLICY.switchroomAggregateBudgetBytes);
  });
});
