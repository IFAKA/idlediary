# Lo-fi Diary SoundFont

`lofi-diary.sf2` is the tiny local SoundFont expected by the SpessaSynth renderer.

It is generated with `BasicSoundBank.getSampleSoundBankFile()` from `spessasynth_core` and is used only as a bundled, license-safe offline rendering bank. The app falls back to its deterministic local renderer if a browser cannot run offline AudioWorklet rendering.
