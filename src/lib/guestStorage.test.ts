import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredGuestProjects, saveGuestProject, removeStoredGuestProject } from './guestStorage';

describe('guestStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with empty guest project list', () => {
    expect(getStoredGuestProjects()).toEqual([]);
  });

  it('saves and lists guest projects without saving capability secrets', () => {
    saveGuestProject('proj_123', 'My Mix 1');
    saveGuestProject('proj_456', 'My Mix 2');

    const stored = getStoredGuestProjects();
    expect(stored).toHaveLength(2);
    expect(stored[0]!.id).toBe('proj_456');
    expect(stored[0]!.title).toBe('My Mix 2');
    expect(stored[1]!.id).toBe('proj_123');
    expect(stored[1]!.title).toBe('My Mix 1');

    // Verify localStorage contains only ID, title, and timestamp
    const raw = window.localStorage.getItem('sw_guest_projects');
    expect(raw).not.toContain('sw_owner_');
    expect(raw).not.toContain('secret');
  });

  it('removes guest project from local storage index', () => {
    saveGuestProject('proj_1', 'Mix 1');
    saveGuestProject('proj_2', 'Mix 2');

    removeStoredGuestProject('proj_1');
    const stored = getStoredGuestProjects();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe('proj_2');
  });

  it('handles duplicates by moving updated project to top', () => {
    saveGuestProject('proj_1', 'Mix 1');
    saveGuestProject('proj_2', 'Mix 2');
    saveGuestProject('proj_1', 'Mix 1 Renamed');

    const stored = getStoredGuestProjects();
    expect(stored).toHaveLength(2);
    expect(stored[0]!.id).toBe('proj_1');
    expect(stored[0]!.title).toBe('Mix 1 Renamed');
  });
});
