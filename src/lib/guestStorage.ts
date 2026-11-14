// Local browser index for guest creator cloud projects (Switchroom v0.5.0)
// Note: As specified in Section 7.2 & 7.3, NEVER store raw capability secrets in localStorage.
// This index stores non-secret display metadata only.

import type { StoredGuestProject } from '../features/cloud/cloudTypes';

const STORAGE_KEY = 'sw_guest_projects';
const MAX_STORED_PROJECTS = 50;

export function getStoredGuestProjects(): StoredGuestProject[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((p) => typeof p?.id === 'string' && typeof p?.title === 'string');
    }
  } catch (err) {
    console.warn('Failed to read guest projects from localStorage:', err);
  }
  return [];
}

export function saveGuestProject(id: string, title: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const existing = getStoredGuestProjects().filter((p) => p.id !== id);
    const updated: StoredGuestProject[] = [
      { id, title: title.trim() || 'Untitled Project', createdAt: Date.now() },
      ...existing,
    ].slice(0, MAX_STORED_PROJECTS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save guest project to localStorage:', err);
  }
}

export function removeStoredGuestProject(id: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const existing = getStoredGuestProjects().filter((p) => p.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.warn('Failed to remove guest project from localStorage:', err);
  }
}
