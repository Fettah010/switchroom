import { describe, expect, it } from 'vitest';
import { createDefaultWorkspace } from './workspaceDefaults';
import {
  exportWorkspaceManifestJson,
  generateManifestFilename,
  serializeWorkspaceToManifest,
} from './workspaceManifest';
import {
  MAX_MANIFEST_FILE_SIZE_BYTES,
  validateAndParseManifest,
} from './workspaceManifestValidation';

describe('workspace manifest import/export and validation', () => {
  it('round-trips workspace record through manifest serialization and parsing', () => {
    const ws = createDefaultWorkspace('ws-original-123');
    ws.title = 'Vocal Mix Comparison';
    ws.description = 'Testing lead vocal presence in chorus.';
    ws.labels = ['vocal', 'mix', 'revision-2'];
    ws.notes = 'Check 0:34 sibilance.';
    ws.preferredCrossfadeMs = 240;
    ws.presentationLayout = 'waveform-focused';
    ws.originalMedia = {
      fileName: 'lead-vocal-dry.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 15400200,
      lastModified: 1710000000000,
      durationSeconds: 125.4,
    };
    ws.editedMedia = {
      fileName: 'lead-vocal-wet.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 15400200,
      lastModified: 1710000005000,
      durationSeconds: 125.4,
    };

    const json = exportWorkspaceManifestJson(ws);
    const parsed = validateAndParseManifest(json);

    expect(parsed.valid).toBe(true);
    expect(parsed.manifest?.app).toBe('switchroom');
    expect(parsed.manifest?.manifestVersion).toBe(1);
    expect(parsed.manifest?.workspace.title).toBe('Vocal Mix Comparison');
    expect(parsed.manifest?.workspace.preferredCrossfadeMs).toBe(240);
    expect(parsed.manifest?.workspace.presentationLayout).toBe('waveform-focused');
    expect(parsed.manifest?.workspace.originalMedia?.fileName).toBe('lead-vocal-dry.wav');

    // On import, a brand new local workspace ID is generated, NOT reusing ws-original-123
    expect(parsed.workspaceRecord?.id).not.toBe('ws-original-123');
    expect(parsed.workspaceRecord?.title).toBe('Vocal Mix Comparison');
    expect(parsed.workspaceRecord?.originalMedia?.fileName).toBe('lead-vocal-dry.wav');
  });

  it('rejects wrong app identifier', () => {
    const badApp = JSON.stringify({
      app: 'other-app',
      manifestVersion: 1,
      workspace: { title: 'Test' },
    });
    const res = validateAndParseManifest(badApp);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('switchroom'))).toBe(true);
  });

  it('rejects unsupported future manifest version', () => {
    const futureVer = JSON.stringify({
      app: 'switchroom',
      manifestVersion: 99,
      workspace: { title: 'Future Comparison' },
    });
    const res = validateAndParseManifest(futureVer);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('version: 99'))).toBe(true);
  });

  it('rejects malformed JSON', () => {
    const res = validateAndParseManifest('{ broken json:');
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/Invalid JSON format/);
  });

  it('rejects oversized manifest', () => {
    const oversized = ' '.repeat(MAX_MANIFEST_FILE_SIZE_BYTES + 10);
    const res = validateAndParseManifest(oversized);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/exceeds maximum allowed size/);
  });

  it('rejects prohibited properties inside manifest', () => {
    const hostile = JSON.stringify({
      app: 'switchroom',
      manifestVersion: 1,
      workspace: {
        title: 'Safe Title',
        audioBuffer: { samples: [1, 2, 3] },
      },
    });
    const res = validateAndParseManifest(hostile);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatch(/Prohibited property "audioBuffer"/);
  });

  it('generates safe, URL-friendly manifest filenames', () => {
    expect(generateManifestFilename('Acoustic vs Master: Take 2 / Rev #3!')).toBe(
      'acoustic-vs-master-take-2-rev-3.switchroom.json',
    );
    expect(generateManifestFilename('   ')).toBe('comparison.switchroom.json');
  });

  it('preserves plain-text HTML-looking strings without evaluation', () => {
    const manifestJson = JSON.stringify({
      app: 'switchroom',
      manifestVersion: 1,
      workspace: {
        title: '<script>alert("xss")</script>',
        description: '<b>Bold description</b>',
        labels: ['<img src=x onerror=alert(1)>'],
        notes: '<div onclick="...">Malicious</div>',
        preferredCrossfadeMs: 180,
        presentationLayout: 'standard',
        originalMedia: null,
        editedMedia: null,
      },
    });

    const parsed = validateAndParseManifest(manifestJson);
    expect(parsed.valid).toBe(true);
    // Plain text is preserved literally as inert string, never HTML
    expect(parsed.workspaceRecord?.title).toBe('<script>alert("xss")</script>');
    expect(parsed.workspaceRecord?.description).toBe('<b>Bold description</b>');
  });

  it('ensures exported JSON has no media bytes, file handles, or paths', () => {
    const ws = createDefaultWorkspace('test');
    ws.originalMedia = {
      fileName: 'song.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 5000,
      lastModified: Date.now(),
      durationSeconds: 10,
    };

    const manifest = serializeWorkspaceToManifest(ws);
    const rawKeys = Object.keys(manifest.workspace);
    expect(rawKeys).not.toContain('file');
    expect(rawKeys).not.toContain('blob');
    expect(rawKeys).not.toContain('pcm');
    expect(rawKeys).not.toContain('audioBuffer');
    expect(rawKeys).not.toContain('filePath');
  });
});
