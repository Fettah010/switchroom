import { describe, expect, it } from 'vitest';
import {
  ACCEPT_ATTRIBUTE,
  compatibilityWarning,
  formatFileSize,
  getFileExtension,
  isAcceptableMime,
  isSupportedExtension,
  validateAudioFile,
} from './fileValidation';

function file(name: string, type = 'audio/wav', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('getFileExtension', () => {
  it('is case-insensitive', () => {
    expect(getFileExtension('take.WAV')).toBe('wav');
    expect(getFileExtension('take.Mp3')).toBe('mp3');
    expect(getFileExtension('take.FlAc')).toBe('flac');
  });

  it('handles names without a usable extension', () => {
    expect(getFileExtension('take')).toBeNull();
    expect(getFileExtension('.wav')).toBeNull();
    expect(getFileExtension('take.')).toBeNull();
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
  });
});

describe('isSupportedExtension', () => {
  it('accepts the five v0.1 formats', () => {
    for (const extension of ['wav', 'mp3', 'flac', 'aac', 'm4a']) {
      expect(isSupportedExtension(extension)).toBe(true);
    }
  });

  it('rejects other extensions', () => {
    expect(isSupportedExtension('ogg')).toBe(false);
    expect(isSupportedExtension('txt')).toBe(false);
    expect(isSupportedExtension(null)).toBe(false);
  });

  it('builds an extension-only accept attribute', () => {
    expect(ACCEPT_ATTRIBUTE).toBe('.wav,.mp3,.flac,.aac,.m4a');
  });
});

describe('isAcceptableMime', () => {
  it('treats blank and generic MIME values as advisory', () => {
    expect(isAcceptableMime('')).toBe(true);
    expect(isAcceptableMime('   ')).toBe(true);
    expect(isAcceptableMime('application/octet-stream')).toBe(true);
    expect(isAcceptableMime('binary/octet-stream')).toBe(true);
  });

  it('accepts audio and MP4 container families', () => {
    expect(isAcceptableMime('audio/wav')).toBe(true);
    expect(isAcceptableMime('audio/mpeg')).toBe(true);
    expect(isAcceptableMime('audio/x-flac')).toBe(true);
    expect(isAcceptableMime('video/mp4')).toBe(true);
    expect(isAcceptableMime('application/mp4')).toBe(true);
  });

  it('rejects clearly unrelated MIME families', () => {
    expect(isAcceptableMime('text/plain')).toBe(false);
    expect(isAcceptableMime('image/png')).toBe(false);
    expect(isAcceptableMime('video/webm')).toBe(false);
    expect(isAcceptableMime('application/pdf')).toBe(false);
  });
});

describe('validateAudioFile', () => {
  it('accepts supported extensions with a blank MIME type', () => {
    const result = validateAudioFile(file('mix.flac', ''));
    expect(result.ok).toBe(true);
  });

  it('accepts supported extensions with a generic MIME type', () => {
    expect(validateAudioFile(file('mix.mp3', 'application/octet-stream')).ok).toBe(true);
    expect(validateAudioFile(file('mix.WAV', 'application/octet-stream')).ok).toBe(true);
  });

  it('accepts supported extensions with a browser container MIME type', () => {
    expect(validateAudioFile(file('mix.m4a', 'video/mp4')).ok).toBe(true);
    expect(validateAudioFile(file('mix.m4a', 'audio/mp4')).ok).toBe(true);
  });

  it('rejects empty files', () => {
    const result = validateAudioFile(file('empty.wav', 'audio/wav', 0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/empty/i);
    }
  });

  it('rejects unsupported extensions with plain wording', () => {
    const result = validateAudioFile(file('notes.txt', 'text/plain'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('Choose a WAV, MP3, FLAC, AAC or M4A file.');
    }
  });

  it('rejects a clearly non-audio MIME family', () => {
    const result = validateAudioFile(file('renamed.mp3', 'text/plain'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/doesn't look like an audio file/i);
    }
  });

  it('accepts a supported extension despite a missing MIME type', () => {
    expect(validateAudioFile(file('mix.aac', '', 10)).ok).toBe(true);
  });
});

describe('compatibilityWarning', () => {
  it('is silent when the browser reports support', () => {
    expect(compatibilityWarning(file('mix.wav'), () => 'probably')).toBeNull();
  });

  it('warns without rejecting when the browser reports nothing', () => {
    const warning = compatibilityWarning(file('mix.wav'), () => '');
    expect(warning).toMatch(/did not report support/i);
  });
});

describe('formatFileSize', () => {
  it('formats bytes and larger units', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 * 4.2)).toBe('4.2 MB');
    expect(formatFileSize(1024 * 1024 * 1024 * 2)).toBe('2 GB');
  });

  it('handles invalid values', () => {
    expect(formatFileSize(null)).toBe('—');
    expect(formatFileSize(Number.NaN)).toBe('—');
    expect(formatFileSize(-1)).toBe('—');
  });
});
