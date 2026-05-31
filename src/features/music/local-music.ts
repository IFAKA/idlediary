import { Midi, Scale } from "tonal";
import { AppError } from "@/features/errors/app-error";
import { composeGeneratedMusic, lofiLoopTemplateForSeed } from "./compose";
import { renderCompositionToWav } from "./render";
import type { ClipMoodDescription, MusicPlan } from "./types";

export const localMusicEngine = "scribbletune-spessasynth";

const fadeOutSeconds = 2.4;
const targetSampleRate = 48_000;
const soundFontPath = "/soundfonts/lofi-diary.sf2";
const spessaWorkletPath = "/spessasynth/spessasynth_processor.min.js";

type MidiEvent = {
  tick: number;
  data: number[];
};

type MidiTrackPlan = {
  name: string;
  channel: number;
  program: number;
  notes: MidiNoteEvent[];
};

export type MidiNoteEvent = {
  midi: number;
  startTicks: number;
  durationTicks: number;
  velocity: number;
};

export type LocalMusicRenderInput = {
  plan: MusicPlan;
  descriptions: ClipMoodDescription[];
  durationSeconds?: number;
  onRawLog?: (message: string) => void;
};

export type LocalMusicRenderResult = {
  musicWav: Uint8Array;
  musicMidi: Uint8Array;
  musicDurationSeconds: number;
  debug: {
    musicEngine: typeof localMusicEngine;
    musicSeed: string;
    musicProfileVersion?: number;
    musicDurationSeconds: number;
    musicMood: string;
    midiBytes: number;
    renderer: "spessasynth" | "procedural";
  };
};

export function musicDurationSecondsForVideo(videoDurationMs: number) {
  return clamp(videoDurationMs / 1000 + fadeOutSeconds, 8, 30);
}

export async function renderLocalMusicWav({
  plan,
  durationSeconds = musicDurationSecondsForVideo(plan.durationMs),
  onRawLog,
}: LocalMusicRenderInput): Promise<LocalMusicRenderResult> {
  const renderPlan = { ...plan, durationMs: Math.round(durationSeconds * 1000) };
  const musicMidi = buildPlanMidi(renderPlan);
  const spessaWav = await renderMidiWithSpessaSynth(musicMidi, durationSeconds, onRawLog);
  const musicWav = spessaWav ?? renderCompositionToWav(await composeGeneratedMusic(renderPlan));

  return {
    musicWav,
    musicMidi,
    musicDurationSeconds: durationSeconds,
    debug: {
      musicEngine: localMusicEngine,
      musicSeed: plan.seed,
      musicDurationSeconds: durationSeconds,
      musicMood: plan.mood,
      midiBytes: musicMidi.byteLength,
      renderer: spessaWav ? "spessasynth" : "procedural",
    },
  };
}

export function buildPlanMidi(plan: MusicPlan) {
  const tracks = buildMidiTrackPlan(plan);
  return encodeMidi({
    bpm: plan.bpm,
    ticksPerQuarter: 480,
    tracks,
  });
}

export function buildMidiTrackPlan(plan: MusicPlan): MidiTrackPlan[] {
  const durationSeconds = Math.max(1, plan.durationMs / 1000);
  const ticksPerQuarter = 480;
  const beatSeconds = 60 / plan.bpm;
  const barTicks = ticksPerQuarter * 4;
  const totalTicks = Math.ceil((durationSeconds / beatSeconds) * ticksPerQuarter);
  const scaleNotes = scaleNoteNames(plan.key, plan.scale);
  const loop = lofiLoopTemplateForSeed(plan.seed);
  const scribblePattern = expandScribblePattern("x_x_x___x_x_x___", scaleNotes);
  const seedOffset = scribblePattern.length % 4;
  const random = seededRandom(`${plan.seed}|midi`);

  const chords: MidiNoteEvent[] = [];
  const bass: MidiNoteEvent[] = [];
  const drums: MidiNoteEvent[] = [];
  const motif: MidiNoteEvent[] = [];
  const texture: MidiNoteEvent[] = [];

  for (let barStart = 0; barStart < totalTicks; barStart += barTicks) {
    const barIndex = Math.floor(barStart / barTicks);
    const degree = loop.chordDegrees[(barIndex + seedOffset) % loop.chordDegrees.length];
    const rootName = scaleNotes[degree % scaleNotes.length];
    const rootMidi = Midi.toMidi(`${rootName}4`) ?? 60;
    for (const interval of chordIntervals(plan.scale, random())) {
      chords.push({
        midi: rootMidi - 12 + interval,
        startTicks: barStart + 28 + jitterTicks(random, 12),
        durationTicks: barTicks * 2 - 24,
        velocity: 52 + Math.floor(random() * 12),
      });
    }

    for (const note of loop.bassNotes) {
      const scaleMidi = Midi.toMidi(`${scaleNotes[note.degree % scaleNotes.length]}3`) ?? rootMidi - 12;
      bass.push({
        midi: scaleMidi - 12,
        startTicks: barStart + swingTicks(note.step, ticksPerQuarter) + jitterTicks(random, 4),
        durationTicks: Math.max(80, Math.round((ticksPerQuarter / 4) * note.lengthSteps * 0.88)),
        velocity: Math.round(58 * note.gain + (plan.energy === "medium" ? 12 : 5)),
      });
    }

    for (const event of loop.kickSteps) {
      drums.push({
        midi: 36,
        startTicks: barStart + swingTicks(event.step, ticksPerQuarter),
        durationTicks: 60,
        velocity: Math.round(64 * event.gain + 36),
      });
    }
    drums.push({ midi: 38, startTicks: barStart + ticksPerQuarter, durationTicks: 70, velocity: 56 });
    drums.push({ midi: 38, startTicks: barStart + ticksPerQuarter * 3, durationTicks: 70, velocity: 52 });
    for (let step = 0; step < 8; step += 1) {
      drums.push({
        midi: 42,
        startTicks: barStart + swingTicks(step * 2, ticksPerQuarter),
        durationTicks: 36,
        velocity: step % 2 === 0 ? 42 : 34,
      });
    }

    if (barIndex % 4 === 1) {
      for (const note of loop.melodyNotes) {
        const scaleMidi = Midi.toMidi(`${scaleNotes[note.degree % scaleNotes.length]}5`) ?? rootMidi + 12;
        motif.push({
          midi: scaleMidi,
          startTicks: barStart + swingTicks(note.step, ticksPerQuarter) + jitterTicks(random, 8),
          durationTicks: Math.max(80, Math.round((ticksPerQuarter / 4) * note.lengthSteps * 0.82)),
          velocity: Math.round(42 * note.gain + 24),
        });
      }
    }

    if (barIndex % 2 === 0) {
      texture.push({
        midi: rootMidi + 12,
        startTicks: barStart + 12,
        durationTicks: barTicks * 2 - 32,
        velocity: plan.texture === "none" ? 0 : 26,
      });
    }
  }

  return [
    { name: "warm chords", channel: 0, program: 4, notes: bounded(chords, totalTicks) },
    { name: "round bass", channel: 1, program: 33, notes: bounded(bass, totalTicks) },
    { name: "soft drums", channel: 9, program: 0, notes: bounded(drums, totalTicks) },
    { name: "sparse motif", channel: 2, program: 5, notes: bounded(motif, totalTicks) },
    { name: "room texture", channel: 3, program: 89, notes: bounded(texture, totalTicks) },
  ];
}

async function renderMidiWithSpessaSynth(
  musicMidi: Uint8Array,
  durationSeconds: number,
  onRawLog?: (message: string) => void,
) {
  try {
    if (typeof window === "undefined" || typeof OfflineAudioContext === "undefined") {
      onRawLog?.("SpessaSynth offline render skipped outside browser audio context");
      return null;
    }

    const [{ WorkletSynthesizer, audioBufferToWav }, { BasicMIDI, SoundBankLoader }] = await Promise.all([
      import("spessasynth_lib"),
      import("spessasynth_core"),
    ]);
    const context = new OfflineAudioContext(2, Math.ceil(durationSeconds * targetSampleRate), targetSampleRate);
    await context.audioWorklet.addModule(spessaWorkletPath);
    const synth = new WorkletSynthesizer(context);
    try {
      const soundFont = await fetchSoundFont();
      const soundBank = SoundBankLoader.fromArrayBuffer(soundFont);
      await synth.soundBankManager.addSoundBank(soundFont, "lofi-diary");
      await synth.isReady;
      await synth.startOfflineRender({
        midiSequence: BasicMIDI.fromArrayBuffer(copyArrayBuffer(musicMidi), "idlediary.mid"),
        soundBankList: [{ soundBank, id: "lofi-diary", bankOffset: 0 }],
        snapshot: await synth.getSnapshot(),
      } as never);
      const buffer = await context.startRendering();
      const wavBlob = audioBufferToWav(buffer);
      return new Uint8Array(await wavBlob.arrayBuffer());
    } finally {
      synth.destroy();
    }
  } catch (cause) {
    onRawLog?.(`SpessaSynth offline render unavailable: ${cause instanceof Error ? cause.message : "unknown error"}`);
    return null;
  }
}

async function fetchSoundFont() {
  const response = await fetch(soundFontPath, { cache: "force-cache" });
  if (!response.ok) throw new Error(`SoundFont missing: ${response.status}`);
  return response.arrayBuffer();
}

function copyArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeMidi({
  bpm,
  ticksPerQuarter,
  tracks,
}: {
  bpm: number;
  ticksPerQuarter: number;
  tracks: MidiTrackPlan[];
}) {
  const trackBytes = tracks.map((track, index) =>
    encodeTrack(track, index === 0 ? microsecondsPerQuarter(bpm) : null),
  );
  return new Uint8Array([
    ...ascii("MThd"),
    ...u32(6),
    ...u16(1),
    ...u16(trackBytes.length),
    ...u16(ticksPerQuarter),
    ...trackBytes.flatMap((track) => [...ascii("MTrk"), ...u32(track.length), ...track]),
  ]);
}

function encodeTrack(track: MidiTrackPlan, tempo: number | null) {
  const events: MidiEvent[] = [
    { tick: 0, data: [0xff, 0x03, track.name.length, ...ascii(track.name)] },
    { tick: 0, data: [0xc0 + track.channel, track.program] },
    { tick: 0, data: [0xb0 + track.channel, 7, 92] },
    { tick: 0, data: [0xb0 + track.channel, 10, 64] },
  ];
  if (tempo !== null) events.push({ tick: 0, data: [0xff, 0x51, 0x03, ...u24(tempo)] });

  for (const note of track.notes) {
    if (note.velocity <= 0) continue;
    events.push({ tick: note.startTicks, data: [0x90 + track.channel, note.midi, note.velocity] });
    events.push({
      tick: note.startTicks + note.durationTicks,
      data: [0x80 + track.channel, note.midi, 0],
    });
  }
  events.sort((left, right) => left.tick - right.tick || left.data[0] - right.data[0]);

  const bytes: number[] = [];
  let lastTick = 0;
  for (const event of events) {
    bytes.push(...varLen(Math.max(0, event.tick - lastTick)), ...event.data);
    lastTick = event.tick;
  }
  bytes.push(0x00, 0xff, 0x2f, 0x00);
  return bytes;
}

function scaleNoteNames(key: string, scale: string) {
  const notes = Scale.get(`${key} ${scale}`).notes;
  if (notes.length > 0) return notes;
  return Scale.get(`${key} major pentatonic`).notes;
}

function chordIntervals(scale: string, randomValue: number) {
  const minorColor = scale.includes("minor") || scale.includes("dorian");
  if (minorColor) return randomValue > 0.46 ? [0, 3, 10, 14] : [0, 3, 10, 17];
  return randomValue > 0.46 ? [0, 4, 11, 14] : [0, 4, 11, 16];
}

function swingTicks(sixteenthStep: number, ticksPerQuarter: number) {
  const beat = Math.floor(sixteenthStep / 4);
  const stepInBeat = sixteenthStep % 4;
  const straightSixteenth = ticksPerQuarter / 4;
  const swungEighth = ticksPerQuarter * 0.59;
  const offset =
    stepInBeat === 0
      ? 0
      : stepInBeat === 1
        ? straightSixteenth
        : stepInBeat === 2
          ? swungEighth
          : swungEighth + straightSixteenth;
  return Math.round(beat * ticksPerQuarter + offset);
}

function bounded(notes: MidiNoteEvent[], totalTicks: number) {
  return notes.map((note) => ({
    ...note,
    midi: clamp(Math.round(note.midi), 0, 127),
    startTicks: clamp(Math.round(note.startTicks), 0, totalTicks - 1),
    durationTicks: clamp(Math.round(note.durationTicks), 1, totalTicks),
    velocity: clamp(Math.round(note.velocity), 1, 127),
  }));
}

function expandScribblePattern(pattern: string, notes: string[]) {
  const events: string[] = [];
  let noteIndex = 0;
  for (const char of pattern) {
    if (char === "x") {
      events.push(notes[noteIndex % notes.length]);
      noteIndex += 1;
    }
    if (char === "_") {
      noteIndex = Math.max(0, noteIndex - 1);
    }
  }
  return events;
}

function jitterTicks(random: () => number, amount: number) {
  return Math.round((random() * 2 - 1) * amount);
}

function seededRandom(seed: string) {
  let state = 0x811c9dc5;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function microsecondsPerQuarter(bpm: number) {
  return Math.round(60_000_000 / bpm);
}

function ascii(value: string) {
  return [...value].map((char) => char.charCodeAt(0));
}

function u16(value: number) {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function u24(value: number) {
  return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function u32(value: number) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function varLen(value: number) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function localMusicUnavailable(cause: unknown) {
  return new AppError({
    code: "generation-unavailable",
    area: "generation",
    message: "Local generative music could not render",
    userMessage: "Generated music needs local browser audio support on this device.",
    cause,
    context: {
      musicEngine: localMusicEngine,
      causeMessage: cause instanceof Error ? cause.message : String(cause),
    },
  });
}
