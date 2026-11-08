#!/usr/bin/env node
/**
 * Generates the local WAV and failure fixtures used by the Playwright suite.
 *
 * The files are deterministic, committed nowhere (see .gitignore) and contain
 * only plain sine tones, so no external sample or licence is involved.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const HEADER_BYTES = 44;
const FADE_SECONDS = 0.02;

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'e2e', 'fixtures');

/**
 * @param {{ seconds: number; frequency: number; amplitude?: number }} options
 * @returns {Buffer}
 */
function createWav({ seconds, frequency, amplitude = 0.36 }) {
  const frames = Math.round(SAMPLE_RATE * seconds);
  const dataBytes = frames * CHANNELS * BYTES_PER_SAMPLE;
  const buffer = Buffer.alloc(HEADER_BYTES + dataBytes);
  const fadeFrames = Math.max(1, Math.round(SAMPLE_RATE * FADE_SECONDS));

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const fadeIn = Math.min(1, frame / fadeFrames);
    const fadeOut = Math.min(1, (frames - 1 - frame) / fadeFrames);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const fundamental = Math.sin(2 * Math.PI * frequency * time);
    const harmonic = Math.sin(2 * Math.PI * frequency * 2 * time) * 0.16;
    const sample = Math.max(-1, Math.min(1, (fundamental + harmonic) * amplitude * envelope));

    buffer.writeInt16LE(Math.round(sample * 32_767), HEADER_BYTES + frame * BYTES_PER_SAMPLE);
  }

  return buffer;
}

const fixtures = new Map([
  // Matched pair: same length, clearly different pitch.
  ['original.wav', createWav({ seconds: 4, frequency: 440 })],
  ['edited.wav', createWav({ seconds: 4, frequency: 554.37 })],
  // Different lengths: the common duration is 2.4 s.
  ['mismatch-original.wav', createWav({ seconds: 3, frequency: 330 })],
  ['mismatch-edited.wav', createWav({ seconds: 2.4, frequency: 415.3 })],
  // Short pair for end-of-playback checks: common duration is 1 s.
  ['short-original.wav', createWav({ seconds: 1.2, frequency: 220 })],
  ['short-edited.wav', createWav({ seconds: 1, frequency: 293.66 })],
]);

await mkdir(OUTPUT_DIR, { recursive: true });

for (const [name, contents] of fixtures) {
  await writeFile(join(OUTPUT_DIR, name), contents);
}

await writeFile(join(OUTPUT_DIR, 'empty.wav'), Buffer.alloc(0));
await writeFile(
  join(OUTPUT_DIR, 'invalid.mp3'),
  'Switchroom E2E fixture. This is text, not an audio stream.\n',
  'utf8',
);
await writeFile(
  join(OUTPUT_DIR, 'notes.txt'),
  'Switchroom E2E fixture with an unsupported extension.\n',
  'utf8',
);

console.log(`Wrote ${fixtures.size + 3} fixtures to ${OUTPUT_DIR}`);
