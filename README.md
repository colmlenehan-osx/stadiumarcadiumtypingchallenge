# Typeside: Stadium Arcadium

A static music typing game. Pick a song, press **Start Challenge**, and type the lyrics before the real audio reaches its end. Plain HTML/CSS/JS: no build step, server, API key or database.

**No audio, lyrics or artwork are included**, because I can't package copyrighted recordings or lyrics. The folder structure, catalogue (all 28 *Stadium Arcadium* tracks, Jupiter and Mars discs) and manifests are ready. Add your own authorised files and it works.

## Modes
- **Full Song**: type everything while the whole song plays. Audio ending = challenge over. Finishing lyrics early shows "you beat the song" and the audio keeps playing.
- **Random Section**: 4 consecutive timed lines, audio plays just that section. Disabled (with a reason) for songs without `timing`.
- **Practice**: no audio, no countdown, ends when the lyrics are complete.

Metrics (also documented in `js/typing-engine.js`): accuracy = correct keystrokes / total keystrokes; WPM = correct characters / 5 / minutes; raw WPM = all keystrokes / 5 / minutes. Elapsed time is `audio.currentTime`, so pausing the audio pauses the challenge. Seeking is disabled (no seek control exists).

## Adding songs and assets
1. **Audio**: put an MP3 (or M4A/OGG/WAV) at the `audio` path from `ASSET_MANIFEST.md`, e.g. `assets/music/stadium-arcadium/jupiter/01-dani-california.mp3`.
2. **Lyrics**: put a UTF-8 `.txt` at the `lyrics` path, e.g. `assets/lyrics/stadium-arcadium/jupiter/01-dani-california.txt`. See `assets/lyrics/_format-example.txt`: `[Verse 1]` lines are labels (shown, not typed); blank lines are stanza breaks (typed as Enter). Curly quotes and dashes are normalised to plain ones.
3. **Naming**: `NN-title-slug.ext`, lowercase, hyphens. To use other names, edit the paths in `data/songs.json`; no code changes needed. Spaces and punctuation in paths work (they are URL-encoded).
4. **Add or edit a song** in `data/songs.json` (copy an entry, give it a unique `id`). New albums go in `data/albums.json`, then reference its `id` from songs.
5. **Mark unavailable**: set `"status": "unavailable"`. Default `"auto"` checks whether the files exist.
6. **Timestamps (optional)**: `"timing": [{"line":0,"start":12.4,"end":15.1}, ...]`, where `line` is the 0-based index among typed lyric lines (labels and blanks not counted) and times are seconds. Needs at least 2 lines. Only add timings you have measured.
7. **Annotations (optional)**: `"annotations": {"3": "your own note"}` by line index; shown as a tooltip. Use only text you are allowed to use.
8. **Artwork (optional)**: `assets/artwork/stadium-arcadium.jpg`. Hidden if missing.

## Preview
`fetch()` is blocked on `file://`. In this folder run `python3 -m http.server` and open http://localhost:8000. (Any static server works.)

## Deploy to GitHub Pages
1. Create a GitHub repository and upload the *contents* of this folder (so `index.html` is at the repo root), including your assets.
2. Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)` → Save.
3. After a minute the site is live at `https://<user>.github.io/<repo>/`. All paths are relative, so the subpath is fine.
Mind GitHub's limits (files under 100 MB, repo ideally under 1 GB).

## Troubleshooting
- **"needs audio / needs lyrics"**: the file isn't at the exact path (case-sensitive on GitHub Pages). Compare against `data/songs.json`.
- **Catalogue won't load**: you opened `index.html` from disk; use a server (above). Also check `data/*.json` is valid JSON.
- **Audio error / won't play**: unsupported or corrupt file. MP3 is safest. Hard-refresh to clear caches.
- **Typing does nothing**: click the lyrics to refocus; make sure the status says Active and no dialog is open.

## Testing performed / not performed
Performed here: JS syntax check; unit tests of the typing engine (`node tests/engine.test.js`); JSON/catalogue validation; verified every file linked from `index.html` exists; served over HTTP and confirmed the page and data files return 200 and that missing assets return 404.
**Not performed** (no browser or audio files in my environment): real audio playback, pause/resume/end events, early-completion flow, Random Section, mobile layout and keyboards, localStorage persistence, GitHub Pages subpath deployment. Please run through those once with a real track.

## Known limitations
Mobile keyboards: Backspace may not register on some Android keyboards; hardware keyboards are the supported path. "Retry" reuses the same random section, "Replay" picks a new one (identical for Full Song). Per-line timestamps are stored but not used for karaoke highlighting.
