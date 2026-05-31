import { arp as scribbleArp, clip as scribbleClip, type NoteObject } from "scribbletune";
import { Midi, Scale } from "tonal";
import { AppError } from "@/features/errors/app-error";
import type { ClipMoodDescription, MusicPlan } from "./types";

export const localMusicEngine = "scribbletune-spessasynth";

const fadeOutSeconds = 2.4;
const targetSampleRate = 48_000;
const midiTicksPerQuarter = 480;
const scribbleTicksPerQuarter = 128;
const scribbleToMidiTicks = midiTicksPerQuarter / scribbleTicksPerQuarter;
const soundFontPath = "/soundfonts/lofi-diary.sf2";
const spessaRenderBlockSize = 128;
let spessaSynthModulesPromise: Promise<typeof import("spessasynth_core")> | null = null;
let soundFontPromise: Promise<ArrayBuffer> | null = null;

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
    renderer: "spessasynth";
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
  const tracks = buildMidiTrackPlan(renderPlan);
  const musicMidi = encodeMidi({
    bpm: renderPlan.bpm,
    ticksPerQuarter: midiTicksPerQuarter,
    tracks,
  });
  const musicWav = await renderTracksWithSpessaSynth(tracks, renderPlan.bpm, durationSeconds, onRawLog).catch((cause) => {
    throw localMusicUnavailable(cause);
  });

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
      renderer: "spessasynth",
    },
  };
}

export function buildPlanMidi(plan: MusicPlan) {
  const tracks = buildMidiTrackPlan(plan);
  return encodeMidi({
    bpm: plan.bpm,
    ticksPerQuarter: midiTicksPerQuarter,
    tracks,
  });
}

export function buildMidiTrackPlan(plan: MusicPlan): MidiTrackPlan[] {
  const durationSeconds = Math.max(1, plan.durationMs / 1000);
  const ticksPerQuarter = midiTicksPerQuarter;
  const beatSeconds = 60 / plan.bpm;
  const totalTicks = Math.ceil((durationSeconds / beatSeconds) * ticksPerQuarter);
  const scaleNotes = scaleNoteNames(plan.key, plan.scale);
  const random = seededRandom(`${plan.seed}|midi`);
  const activity = plan.activity ?? (plan.energy === "medium" ? "medium" : "low");
  const progression = scribbleChordProgression(plan, scaleNotes, random);
  const bassNotes = scribbleArp({ chords: progression.join(" "), count: 4, order: "0123" })
    .filter((_, index) => index % 4 === 0)
    .map((note) => note.replace(/\d$/, "2"));
  const motifNotes = scaleNotes.map((note) => `${note}5`);
  const drumVelocityLift = activity === "high" ? 14 : activity === "medium" ? 8 : 0;

  const chords = repeatScribbleClip(
    scribbleClip({
      notes: progression,
      pattern: "x___x___x___x___",
      subdiv: "4n",
      amp: activity === "high" ? 104 : 96,
    }),
    totalTicks,
    random,
    8,
  );
  const bass = repeatScribbleClip(
    scribbleClip({
      notes: bassNotes,
      pattern: activity === "low" ? "x---x---x---x---" : "x-x-x---x-x-x---",
      subdiv: "8n",
      amp: activity === "high" ? 116 : activity === "medium" ? 108 : 102,
      accent: "x---x---x---x---",
    }),
    totalTicks,
    random,
    4,
  );
  const drums = [
    ...repeatScribbleClip(
      scribbleClip({
        notes: "C2",
        pattern: activity === "low" ? "x-----x---x-----" : "x---x-x---x-x---",
        subdiv: "16n",
        amp: 116 + drumVelocityLift,
      }),
      totalTicks,
      random,
      1,
    ),
    ...repeatScribbleClip(
      scribbleClip({
        notes: "D2",
        pattern: "----x-------x---",
        subdiv: "16n",
        amp: 88 + drumVelocityLift,
      }),
      totalTicks,
      random,
      1,
    ),
    ...repeatScribbleClip(
      scribbleClip({
        notes: "F#2",
        pattern: activity === "low" ? "x---x---x---x---" : "x-x-x-x-x-x-x-x-",
        subdiv: "16n",
        amp: 56 + drumVelocityLift,
      }),
      totalTicks,
      random,
      1,
    ),
  ];
  const motif = repeatScribbleClip(
    scribbleClip({
      notes: seededRotate(motifNotes, random),
      pattern: activity === "high" ? "----x--x----x--x" : "----x-------x---",
      subdiv: "16n",
      amp: activity === "high" ? 78 : 68,
    }),
    totalTicks,
    random,
    10,
  ).filter((_, index) => activity === "high" || index % 2 === 0);
  const texture =
    plan.texture === "none"
      ? []
      : repeatScribbleClip(
          scribbleClip({
            notes: progression.map((chord) => chord.replace("_3", "_4")),
            pattern: "x_______x_______",
            subdiv: "4n",
            amp: plan.texture === "rain" ? 50 : 44,
          }),
          totalTicks,
          random,
          12,
        );

  return [
    { name: "warm chords", channel: 0, program: 4, notes: bounded(chords, totalTicks) },
    { name: "upright bass", channel: 1, program: 32, notes: bounded(bass, totalTicks) },
    { name: "brush drums", channel: 9, program: 40, notes: bounded(drums, totalTicks) },
    { name: "vibes motif", channel: 2, program: 11, notes: bounded(motif, totalTicks) },
    { name: "room texture", channel: 3, program: 48, notes: bounded(texture, totalTicks) },
  ];
}

async function renderTracksWithSpessaSynth(
  tracks: MidiTrackPlan[],
  bpm: number,
  durationSeconds: number,
  onRawLog?: (message: string) => void,
) {
  try {
    const { SoundBankLoader, SpessaLog, SpessaSynthProcessor, audioToWav } = await loadSpessaSynthModules();
    const processor = new SpessaSynthProcessor(targetSampleRate, {
      effectsEnabled: true,
      eventsEnabled: false,
      maxBufferSize: spessaRenderBlockSize,
    });
    try {
      const soundFont = await fetchSoundFont();
      SpessaLog.setLogLevel(false, true, false);
      processor.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(soundFont), "lofi-diary", 0);
      processor.reset();
      processor.setSystemParameter("gain", 1.25);
      for (const track of tracks) {
        if (track.channel === 9) processor.midiChannels[track.channel]?.setDrums(true);
        processor.programChange(track.channel, track.program);
        processor.controllerChange(track.channel, 7, track.channel === 9 ? 106 : 94);
        processor.controllerChange(track.channel, 10, 64);
        processor.controllerChange(track.channel, 91, track.channel === 1 ? 18 : 34);
        processor.controllerChange(track.channel, 93, track.channel === 9 ? 8 : 18);
      }

      const sampleCount = Math.ceil(durationSeconds * targetSampleRate);
      const left = new Float32Array(sampleCount);
      const right = new Float32Array(sampleCount);
      renderScheduledTrackEvents(processor, tracks, bpm, left, right);
      applyLofiMaster(left, right);
      return new Uint8Array(audioToWav([left, right], targetSampleRate));
    } finally {
      processor.destroySynthProcessor();
    }
  } catch (cause) {
    onRawLog?.(`SpessaSynth render unavailable: ${cause instanceof Error ? cause.message : "unknown error"}`);
    throw cause;
  }
}

function renderScheduledTrackEvents(
  processor: import("spessasynth_core").SpessaSynthProcessor,
  tracks: MidiTrackPlan[],
  bpm: number,
  left: Float32Array,
  right: Float32Array,
) {
  const events = scheduledTrackEvents(tracks, bpm);
  let eventIndex = 0;
  let cursor = 0;
  while (cursor < left.length) {
    while (events[eventIndex] && events[eventIndex].sample <= cursor) {
      const event = events[eventIndex];
      if (event.type === "on") processor.noteOn(event.channel, event.midi, event.velocity);
      else processor.noteOff(event.channel, event.midi);
      eventIndex += 1;
    }

    const nextEventSample = events[eventIndex]?.sample ?? left.length;
    const nextCursor = Math.min(left.length, cursor + spessaRenderBlockSize, Math.max(cursor + 1, nextEventSample));
    processor.process(left, right, cursor, nextCursor - cursor);
    cursor = nextCursor;
  }
  processor.stopAllChannels(true);
}

function scheduledTrackEvents(tracks: MidiTrackPlan[], bpm: number) {
  const beatSeconds = 60 / bpm;
  return tracks
    .flatMap((track) =>
      track.notes.flatMap((note) => {
        const start = ticksToSamples(note.startTicks, beatSeconds);
        const end = ticksToSamples(note.startTicks + note.durationTicks, beatSeconds);
        return [
          { sample: start, order: 1, type: "on" as const, channel: track.channel, midi: note.midi, velocity: note.velocity },
          { sample: end, order: 0, type: "off" as const, channel: track.channel, midi: note.midi, velocity: 0 },
        ];
      }),
    )
    .sort((left, right) => left.sample - right.sample || left.order - right.order);
}

function ticksToSamples(ticks: number, beatSeconds: number) {
  return Math.max(0, Math.round((ticks / midiTicksPerQuarter) * beatSeconds * targetSampleRate));
}

function applyLofiMaster(left: Float32Array, right: Float32Array) {
  const lowPassCutoff = 4_800;
  const rc = 1 / (Math.PI * 2 * lowPassCutoff);
  const alpha = (1 / targetSampleRate) / (rc + 1 / targetSampleRate);
  let filteredLeft = left[0] ?? 0;
  let filteredRight = right[0] ?? 0;
  let previousLeft = filteredLeft;
  let previousRight = filteredRight;

  for (let index = 0; index < left.length; index += 1) {
    filteredLeft += alpha * (left[index] - filteredLeft);
    filteredRight += alpha * (right[index] - filteredRight);
    const wobble = 0.982 + Math.sin((Math.PI * 2 * index * 0.23) / targetSampleRate) * 0.018;
    const mono = (filteredLeft + filteredRight) * 0.5;
    const widthLeft = filteredLeft * 0.82 + mono * 0.18;
    const widthRight = filteredRight * 0.82 + mono * 0.18;
    const softenedLeft = widthLeft * 0.86 + previousLeft * 0.14;
    const softenedRight = widthRight * 0.86 + previousRight * 0.14;
    left[index] = Math.tanh(softenedLeft * 1.45) * 0.82 * wobble;
    right[index] = Math.tanh(softenedRight * 1.45) * 0.82 * wobble;
    previousLeft = softenedLeft;
    previousRight = softenedRight;
  }
}

async function fetchSoundFont() {
  soundFontPromise ??= (async () => {
    const response = await fetch(soundFontPath, { cache: "force-cache" });
    if (!response.ok) throw new Error(`SoundFont missing: ${response.status}`);
    const soundFont = await response.arrayBuffer();
    const { SoundBankLoader } = await loadSpessaSynthModules();
    const presetCount = SoundBankLoader.fromArrayBuffer(soundFont.slice(0)).presets.length;
    if (presetCount < 120) throw new Error(`SoundFont has only ${presetCount} presets`);
    return soundFont;
  })();
  return (await soundFontPromise).slice(0);
}

async function loadSpessaSynthModules() {
  spessaSynthModulesPromise ??= import("spessasynth_core");
  return spessaSynthModulesPromise;
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

function scribbleChordProgression(plan: MusicPlan, scaleNotes: string[], random: () => number) {
  const minorColor = plan.scale.includes("minor") || plan.scale.includes("dorian");
  const templates = minorColor
    ? [
        [0, 3, 4, 2],
        [0, 4, 1, 3],
        [0, 2, 4, 3],
      ]
    : [
        [0, 3, 4, 2],
        [0, 4, 1, 3],
        [0, 2, 3, 4],
      ];
  const template = templates[Math.floor(random() * templates.length)] ?? templates[0];
  return template.map((degree, index) => {
    const root = scaleNotes[degree % scaleNotes.length] ?? plan.key;
    const quality = minorColor ? (index === 1 ? "M" : "m") : index === 2 ? "m" : "M";
    return `${root}${quality}_3`;
  });
}

function repeatScribbleClip(
  clipNotes: NoteObject[],
  totalTicks: number,
  random: () => number,
  jitterAmount: number,
) {
  const cycleTicks = Math.max(
    1,
    Math.round(clipNotes.reduce((total, note) => total + note.length, 0) * scribbleToMidiTicks),
  );
  const notes: MidiNoteEvent[] = [];
  for (let cycleStart = 0; cycleStart < totalTicks; cycleStart += cycleTicks) {
    notes.push(...scribbleNotesToMidiEvents(clipNotes, cycleStart, random, jitterAmount));
  }
  return notes;
}

function scribbleNotesToMidiEvents(
  clipNotes: NoteObject[],
  startOffsetTicks: number,
  random: () => number,
  jitterAmount: number,
) {
  const notes: MidiNoteEvent[] = [];
  let cursorTicks = startOffsetTicks;
  for (const clipNote of clipNotes) {
    const durationTicks = Math.max(1, Math.round(clipNote.length * scribbleToMidiTicks));
    if (clipNote.note) {
      for (const note of clipNote.note) {
        const midi = Midi.toMidi(note);
        if (midi === null) continue;
        notes.push({
          midi,
          startTicks: cursorTicks + jitterTicks(random, jitterAmount),
          durationTicks: Math.max(36, durationTicks - 18),
          velocity: clipNote.level,
        });
      }
    }
    cursorTicks += durationTicks;
  }
  return notes;
}

function seededRotate<T>(values: T[], random: () => number) {
  if (values.length === 0) return values;
  const offset = Math.floor(random() * values.length);
  return [...values.slice(offset), ...values.slice(0, offset)];
}

export function chordIntervals(scale: string, randomValue: number) {
  const minorColor = scale.includes("minor") || scale.includes("dorian");
  if (minorColor) return randomValue > 0.46 ? [0, 3, 10, 14] : [0, 3, 10, 17];
  return randomValue > 0.46 ? [0, 4, 11, 14] : [0, 4, 11, 16];
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
