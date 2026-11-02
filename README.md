# IdleDiary

A no-pressure, hold-to-record video diary PWA: capture tiny moments, then turn them into a daily vlog with generated music.

Live: https://idlediary.vercel.app

## Features

- Hold to record short clips (about 0.7 to 15 seconds); nothing starts until you hold the record button.
- Camera and microphone permission flow, clip review, and reordering of clips.
- Generates a diary video from your clips in the browser using FFmpeg (WebAssembly), with a color grade and thumbnails.
- Generates a lo-fi style soundtrack locally (the music plan is derived from the look of your clips), so nothing is uploaded.
- Saved diaries are listed with a player and detail screen.
- First-launch intro explaining how it works.
- Local-first storage in the browser (IndexedDB); installable and works offline.
- Light/dark theme and a debug drawer for errors.

## Run locally

```bash
npm install     # also runs the music model install script
npm run dev
npm run build
npm start
npm test        # unit tests (Vitest)
npm run test:e2e   # Playwright
npm run lint
```

Note: the `demo:*` scripts and the `@faka/demo-director` dev dependency point to a sibling folder (`../agentic-demo-director`) that is not part of this repo.

## Tech

Next.js (App Router), React, TypeScript, Tailwind CSS v4, Radix UI, vaul, motion, idb, FFmpeg.wasm, Hugging Face Transformers, Tone.js, Scribbletune, SpessaSynth (SoundFont rendering), tonal, Vitest, Playwright. Deployed on Vercel.

## Support

If this project is useful to you, you can support my work:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zfaka)
