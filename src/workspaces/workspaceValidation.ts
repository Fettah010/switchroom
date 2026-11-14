import { DEFAULT_CROSSFADE_MS, MAX_CROSSFADE_MS, MIN_CROSSFADE_MS } from '../audio/crossfade';
import { CURRENT_WORKSPACE_SCHEMA_VERSION, DEFAULT_PREFERENCES } from './workspaceDefaults';
import {
  PRESENTATION_LAYOUTS,
  type LocalPreferences,
  type MediaDescriptor,
  type MotionPreference,
  type PresentationLayout,
  type WorkspaceRecord,
} from './workspaceTypes';

export const CROSSFADE_STEP_MS = 20;
export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_LABELS_COUNT = 12;
export const MAX_LABEL_LENGTH = 40;
export const MAX_NOTES_LENGTH = 10000;

export const PROHIBITED_PROPERTY_NAMES: readonly string[] = [
  'file',
  'blob',
  'buffer',
  'pcm',
  'peaks',
  'audioBuffer',
  'audioData',
  'audioContext',
  'mediaElement',
  'objectUrl',
  'url',
  'path',
  'filePath',
  'handle',
  'fileHandle',
  'token',
  'authToken',
  'credentials',
];

export function assertNoProhibitedProperties(target: unknown, path = 'root'): void {
  if (target === null || typeof target !== 'object') {
    return;
  }

  // Check if target is a binary/DOM object
  if (
    (typeof File !== 'undefined' && target instanceof File) ||
    (typeof Blob !== 'undefined' && target instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && target instanceof ArrayBuffer) ||
    (typeof Float32Array !== 'undefined' && target instanceof Float32Array) ||
    (typeof AudioBuffer !== 'undefined' && target instanceof AudioBuffer)
  ) {
    throw new Error(`Prohibited binary object detected at ${path}`);
  }

  const record = target as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const lowerKey = key.toLowerCase();
    for (const prohibited of PROHIBITED_PROPERTY_NAMES) {
      if (lowerKey === prohibited.toLowerCase()) {
        throw new Error(`Prohibited property "${key}" detected at ${path}.${key}`);
      }
    }

    const value = record[key];
    if (value !== null && typeof value === 'object') {
      assertNoProhibitedProperties(value, `${path}.${key}`);
    }
  }
}

export function validateWorkspaceTitle(raw: unknown): {
  valid: boolean;
  value: string;
  error?: string;
} {
  if (typeof raw !== 'string') {
    return { valid: false, value: 'Untitled comparison', error: 'Title must be a string.' };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false, value: 'Untitled comparison', error: 'Title cannot be empty.' };
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return {
      valid: false,
      value: trimmed.slice(0, MAX_TITLE_LENGTH),
      error: `Title cannot exceed ${MAX_TITLE_LENGTH} characters.`,
    };
  }
  return { valid: true, value: trimmed };
}

export function validateWorkspaceDescription(raw: unknown): {
  valid: boolean;
  value: string;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return { valid: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return { valid: false, value: '', error: 'Description must be a string.' };
  }
  if (raw.length > MAX_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      value: raw.slice(0, MAX_DESCRIPTION_LENGTH),
      error: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
    };
  }
  return { valid: true, value: raw };
}

export function validateWorkspaceLabels(raw: unknown): {
  valid: boolean;
  value: string[];
  error?: string;
} {
  if (!Array.isArray(raw)) {
    return { valid: false, value: [], error: 'Labels must be an array.' };
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const limited = trimmed.slice(0, MAX_LABEL_LENGTH);
    const lower = limited.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      sanitized.push(limited);
    }
    if (sanitized.length >= MAX_LABELS_COUNT) {
      break;
    }
  }

  const valid =
    raw.length <= MAX_LABELS_COUNT &&
    raw.every((l) => typeof l === 'string' && l.trim().length <= MAX_LABEL_LENGTH);

  return {
    valid,
    value: sanitized,
    error: valid
      ? undefined
      : `Labels must be up to ${MAX_LABELS_COUNT} items of at most ${MAX_LABEL_LENGTH} chars.`,
  };
}

export function validateWorkspaceNotes(raw: unknown): {
  valid: boolean;
  value: string;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return { valid: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return { valid: false, value: '', error: 'Notes must be a string.' };
  }
  if (raw.length > MAX_NOTES_LENGTH) {
    return {
      valid: false,
      value: raw.slice(0, MAX_NOTES_LENGTH),
      error: `Notes cannot exceed ${MAX_NOTES_LENGTH} characters.`,
    };
  }
  return { valid: true, value: raw };
}

export function validateCrossfadeMs(raw: unknown): {
  valid: boolean;
  value: number;
  error?: string;
} {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return {
      valid: false,
      value: DEFAULT_CROSSFADE_MS,
      error: 'Crossfade duration must be a finite number.',
    };
  }

  const clamped = Math.min(MAX_CROSSFADE_MS, Math.max(MIN_CROSSFADE_MS, raw));
  // Snap to 20ms step
  const stepped =
    Math.round((clamped - MIN_CROSSFADE_MS) / CROSSFADE_STEP_MS) * CROSSFADE_STEP_MS +
    MIN_CROSSFADE_MS;
  const isExact = raw === stepped && raw >= MIN_CROSSFADE_MS && raw <= MAX_CROSSFADE_MS;

  return {
    valid: isExact,
    value: stepped,
    error: isExact
      ? undefined
      : `Crossfade duration must be between ${MIN_CROSSFADE_MS} and ${MAX_CROSSFADE_MS} ms in ${CROSSFADE_STEP_MS} ms steps.`,
  };
}

export function validatePresentationLayout(raw: unknown): {
  valid: boolean;
  value: PresentationLayout;
  error?: string;
} {
  if (typeof raw === 'string' && (PRESENTATION_LAYOUTS as readonly string[]).includes(raw)) {
    return { valid: true, value: raw as PresentationLayout };
  }
  return {
    valid: false,
    value: 'standard',
    error: `Presentation layout must be one of: ${PRESENTATION_LAYOUTS.join(', ')}.`,
  };
}

export function validateMotionPreference(raw: unknown): {
  valid: boolean;
  value: MotionPreference;
  error?: string;
} {
  if (raw === 'system' || raw === 'reduced') {
    return { valid: true, value: raw };
  }
  return {
    valid: false,
    value: 'system',
    error: 'Motion preference must be "system" or "reduced".',
  };
}

export function validateMediaDescriptor(raw: unknown): {
  valid: boolean;
  value: MediaDescriptor | null;
  error?: string;
} {
  if (raw === null || raw === undefined) {
    return { valid: true, value: null };
  }
  if (typeof raw !== 'object') {
    return { valid: false, value: null, error: 'Media descriptor must be an object or null.' };
  }

  assertNoProhibitedProperties(raw, 'mediaDescriptor');

  const desc = raw as Partial<MediaDescriptor>;
  if (typeof desc.fileName !== 'string' || !desc.fileName.trim()) {
    return { valid: false, value: null, error: 'Media descriptor requires a non-empty fileName.' };
  }

  const fileName = desc.fileName.trim().slice(0, 255);
  const extension =
    typeof desc.extension === 'string' ? desc.extension.trim().toLowerCase().slice(0, 16) : null;
  const mimeType =
    typeof desc.mimeType === 'string'
      ? desc.mimeType.trim().slice(0, 100)
      : 'application/octet-stream';
  const sizeBytes =
    typeof desc.sizeBytes === 'number' && Number.isFinite(desc.sizeBytes) && desc.sizeBytes >= 0
      ? Math.round(desc.sizeBytes)
      : 0;
  const lastModified =
    typeof desc.lastModified === 'number' && Number.isFinite(desc.lastModified)
      ? Math.round(desc.lastModified)
      : Date.now();
  const durationSeconds =
    typeof desc.durationSeconds === 'number' &&
    Number.isFinite(desc.durationSeconds) &&
    desc.durationSeconds >= 0
      ? Number(desc.durationSeconds.toFixed(3))
      : null;

  return {
    valid: true,
    value: {
      fileName,
      extension,
      mimeType,
      sizeBytes,
      lastModified,
      durationSeconds,
    },
  };
}

export function createMediaDescriptor(
  file: File,
  durationSeconds?: number | null,
): MediaDescriptor {
  const extension = file.name.includes('.')
    ? (file.name.split('.').pop()?.toLowerCase() ?? null)
    : null;

  return {
    fileName: file.name,
    extension,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    lastModified: file.lastModified,
    durationSeconds:
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds) &&
      durationSeconds >= 0
        ? Number(durationSeconds.toFixed(3))
        : null,
  };
}

export function validateWorkspaceRecord(raw: unknown): {
  valid: boolean;
  value?: WorkspaceRecord;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Workspace record must be an object.'] };
  }

  assertNoProhibitedProperties(raw, 'workspaceRecord');

  const rec = raw as Record<string, unknown>;

  if (typeof rec.id !== 'string' || !rec.id.trim()) {
    errors.push('Workspace id is required and must be a non-empty string.');
  }

  if (rec.schemaVersion !== CURRENT_WORKSPACE_SCHEMA_VERSION) {
    errors.push(`Unsupported workspace schemaVersion: ${String(rec.schemaVersion)}`);
  }

  const titleRes = validateWorkspaceTitle(rec.title);
  if (!titleRes.valid && titleRes.error) {
    errors.push(titleRes.error);
  }

  const descRes = validateWorkspaceDescription(rec.description);
  if (!descRes.valid && descRes.error) {
    errors.push(descRes.error);
  }

  const labelsRes = validateWorkspaceLabels(rec.labels);
  if (!labelsRes.valid && labelsRes.error) {
    errors.push(labelsRes.error);
  }

  const notesRes = validateWorkspaceNotes(rec.notes);
  if (!notesRes.valid && notesRes.error) {
    errors.push(notesRes.error);
  }

  const crossfadeRes = validateCrossfadeMs(rec.preferredCrossfadeMs);
  if (!crossfadeRes.valid && crossfadeRes.error) {
    errors.push(crossfadeRes.error);
  }

  const layoutRes = validatePresentationLayout(rec.presentationLayout);
  if (!layoutRes.valid && layoutRes.error) {
    errors.push(layoutRes.error);
  }

  const origRes = validateMediaDescriptor(rec.originalMedia);
  if (!origRes.valid && origRes.error) {
    errors.push(`Original media: ${origRes.error}`);
  }

  const editRes = validateMediaDescriptor(rec.editedMedia);
  if (!editRes.valid && editRes.error) {
    errors.push(`Edited media: ${editRes.error}`);
  }

  const now = new Date().toISOString();
  const createdAt =
    typeof rec.createdAt === 'string' && !isNaN(Date.parse(rec.createdAt)) ? rec.createdAt : now;
  const updatedAt =
    typeof rec.updatedAt === 'string' && !isNaN(Date.parse(rec.updatedAt)) ? rec.updatedAt : now;
  const lastOpenedAt =
    typeof rec.lastOpenedAt === 'string' && !isNaN(Date.parse(rec.lastOpenedAt))
      ? rec.lastOpenedAt
      : updatedAt;

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      id: (rec.id as string).trim(),
      schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
      title: titleRes.value,
      description: descRes.value,
      labels: labelsRes.value,
      notes: notesRes.value,
      preferredCrossfadeMs: crossfadeRes.value,
      presentationLayout: layoutRes.value,
      originalMedia: origRes.value,
      editedMedia: editRes.value,
      createdAt,
      updatedAt,
      lastOpenedAt,
    },
    errors: [],
  };
}

export function validateLocalPreferences(raw: unknown): {
  valid: boolean;
  value: LocalPreferences;
  error?: string;
} {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, value: DEFAULT_PREFERENCES, error: 'Preferences must be an object.' };
  }

  const rec = raw as Record<string, unknown>;
  const motionRes = validateMotionPreference(rec.motionPreference);
  const crossfadeRes = validateCrossfadeMs(rec.defaultCrossfadeMs);
  const layoutRes = validatePresentationLayout(rec.defaultPresentationLayout);

  const valid = motionRes.valid && crossfadeRes.valid && layoutRes.valid;

  return {
    valid,
    value: {
      motionPreference: motionRes.value,
      defaultCrossfadeMs: crossfadeRes.value,
      defaultPresentationLayout: layoutRes.value,
    },
  };
}
