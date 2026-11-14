import { describe, expect, it } from 'vitest';
import {
  createDefaultWorkspace,
  DEFAULT_PREFERENCES,
  generateWorkspaceId,
} from './workspaceDefaults';
import {
  assertNoProhibitedProperties,
  createMediaDescriptor,
  validateCrossfadeMs,
  validateLocalPreferences,
  validateMediaDescriptor,
  validateMotionPreference,
  validatePresentationLayout,
  validateWorkspaceDescription,
  validateWorkspaceLabels,
  validateWorkspaceNotes,
  validateWorkspaceRecord,
  validateWorkspaceTitle,
} from './workspaceValidation';

describe('workspace domain models and validation', () => {
  it('generates a valid default workspace', () => {
    const ws = createDefaultWorkspace();
    expect(ws.id).toBeTruthy();
    expect(ws.title).toBe('Untitled comparison');
    expect(ws.schemaVersion).toBe(1);
    expect(ws.description).toBe('');
    expect(ws.labels).toEqual([]);
    expect(ws.notes).toBe('');
    expect(ws.preferredCrossfadeMs).toBe(180);
    expect(ws.presentationLayout).toBe('standard');
    expect(ws.originalMedia).toBeNull();
    expect(ws.editedMedia).toBeNull();
    expect(new Date(ws.createdAt).getTime()).toBeGreaterThan(0);
  });

  it('generates distinct IDs', () => {
    const id1 = generateWorkspaceId();
    const id2 = generateWorkspaceId();
    expect(id1).not.toBe(id2);
  });

  it('validates workspace title with trimming and length limits', () => {
    expect(validateWorkspaceTitle('   Mastering check   ').value).toBe('Mastering check');
    expect(validateWorkspaceTitle('  ').valid).toBe(false);
    expect(validateWorkspaceTitle('  ').value).toBe('Untitled comparison');

    const longTitle = 'A'.repeat(150);
    const res = validateWorkspaceTitle(longTitle);
    expect(res.valid).toBe(false);
    expect(res.value.length).toBe(120);
  });

  it('validates description and notes length limits', () => {
    const longDesc = 'B'.repeat(2500);
    const descRes = validateWorkspaceDescription(longDesc);
    expect(descRes.valid).toBe(false);
    expect(descRes.value.length).toBe(2000);

    const longNotes = 'N'.repeat(12000);
    const notesRes = validateWorkspaceNotes(longNotes);
    expect(notesRes.valid).toBe(false);
    expect(notesRes.value.length).toBe(10000);
  });

  it('validates labels: deduplication, trimming, and count limits', () => {
    const raw = [' Mix ', 'mix', 'MASTER', 'master ', '  ', 'vocal'];
    const res = validateWorkspaceLabels(raw);
    expect(res.value).toEqual(['Mix', 'MASTER', 'vocal']);

    const many = Array.from({ length: 20 }, (_, i) => `label-${i}`);
    const manyRes = validateWorkspaceLabels(many);
    expect(manyRes.valid).toBe(false);
    expect(manyRes.value.length).toBe(12);
  });

  it('validates crossfade bounds and 20ms steps', () => {
    expect(validateCrossfadeMs(180).valid).toBe(true);
    expect(validateCrossfadeMs(180).value).toBe(180);

    // Snapped to step
    const stepped = validateCrossfadeMs(193);
    expect(stepped.valid).toBe(false);
    expect(stepped.value).toBe(200);

    // Below min
    const low = validateCrossfadeMs(50);
    expect(low.valid).toBe(false);
    expect(low.value).toBe(80);

    // Above max
    const high = validateCrossfadeMs(800);
    expect(high.valid).toBe(false);
    expect(high.value).toBe(600);
  });

  it('validates presentation layouts', () => {
    expect(validatePresentationLayout('standard').valid).toBe(true);
    expect(validatePresentationLayout('player-focused').valid).toBe(true);
    expect(validatePresentationLayout('waveform-focused').valid).toBe(true);
    expect(validatePresentationLayout('compact-review').valid).toBe(true);
    expect(validatePresentationLayout('nonexistent').valid).toBe(false);
    expect(validatePresentationLayout('nonexistent').value).toBe('standard');
  });

  it('validates motion preference', () => {
    expect(validateMotionPreference('system').valid).toBe(true);
    expect(validateMotionPreference('reduced').valid).toBe(true);
    expect(validateMotionPreference('invalid').valid).toBe(false);
    expect(validateMotionPreference('invalid').value).toBe('system');
  });

  it('creates media descriptor from file with sanitized metadata and no audio bytes', () => {
    const file = new File(['fake-audio-content'], 'track-final.wav', {
      type: 'audio/wav',
      lastModified: 1700000000000,
    });
    const desc = createMediaDescriptor(file, 124.5678);
    expect(desc.fileName).toBe('track-final.wav');
    expect(desc.extension).toBe('wav');
    expect(desc.mimeType).toBe('audio/wav');
    expect(desc.sizeBytes).toBe(18);
    expect(desc.lastModified).toBe(1700000000000);
    expect(desc.durationSeconds).toBe(124.568);
    expect((desc as unknown as Record<string, unknown>).file).toBeUndefined();
    expect((desc as unknown as Record<string, unknown>).blob).toBeUndefined();
  });

  it('validates media descriptor object safely', () => {
    expect(validateMediaDescriptor(null).value).toBeNull();
    const validDesc = {
      fileName: 'test.mp3',
      extension: 'mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
      lastModified: Date.now(),
      durationSeconds: 12.3,
    };
    const res = validateMediaDescriptor(validDesc);
    expect(res.valid).toBe(true);
    expect(res.value?.fileName).toBe('test.mp3');
  });

  it('strictly prohibits media-bearing or dangerous properties', () => {
    expect(() => {
      assertNoProhibitedProperties({
        title: 'test',
        audioBuffer: {},
      });
    }).toThrow(/Prohibited property "audioBuffer"/);

    expect(() => {
      assertNoProhibitedProperties({
        title: 'test',
        blob: new Blob([]),
      });
    }).toThrow(/Prohibited property "blob"/);

    expect(() => {
      assertNoProhibitedProperties({
        title: 'test',
        fileHandle: 'fake-handle',
      });
    }).toThrow(/Prohibited property "fileHandle"/);

    expect(() => {
      assertNoProhibitedProperties({
        nested: {
          pcm: [1, 2, 3],
        },
      });
    }).toThrow(/Prohibited property "pcm"/);
  });

  it('validates complete WorkspaceRecord with full fidelity', () => {
    const ws = createDefaultWorkspace('test-ws-id');
    const res = validateWorkspaceRecord(ws);
    expect(res.valid).toBe(true);
    expect(res.value?.id).toBe('test-ws-id');
    expect(res.value?.title).toBe('Untitled comparison');
  });

  it('validates LocalPreferences', () => {
    const prefRes = validateLocalPreferences({
      motionPreference: 'reduced',
      defaultCrossfadeMs: 220,
      defaultPresentationLayout: 'waveform-focused',
    });
    expect(prefRes.valid).toBe(true);
    expect(prefRes.value.motionPreference).toBe('reduced');
    expect(prefRes.value.defaultCrossfadeMs).toBe(220);
    expect(prefRes.value.defaultPresentationLayout).toBe('waveform-focused');

    const invalidRes = validateLocalPreferences({});
    expect(invalidRes.value).toEqual(DEFAULT_PREFERENCES);
  });
});
