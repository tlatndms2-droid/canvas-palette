# 0.3.77 verification — 2026-09-05

Compared released 0.3.76 and built 0.3.77 in the same isolated Obsidian 1.13.7 Sandbox. No real Vault was modified. Existing repository edits and unrelated artifacts were preserved.

## Fixes verified

- Side search retains the same input element, query, focus and cursor offset (2) during linked Canvas updates; unrelated card DOM survives. IME composition and final Korean text survive; another focused control does not cause search to regain focus.
- Collect Import immediately shows the final selected count and disables Import when no selection remains. A mixed new/duplicate import leaves only the duplicate selected. Missing-workspace rejection and batch observer ordering have automated regression coverage.
- Mini selection reuses card preview DOM. Canvas selection notifications skip unrelated decorations. Unchanged visible decorations retain their element identity.
- Offscreen Canvas nodes are not decorated while detached. Returning to them automatically displays metadata changed while offscreen. Label, caption, tags, link badges and Front/Back were exercised.
- One changed Card propagates to its other Canvas; instrumentation saw no unrelated Card propagation. Same-Canvas inbound work uses the existing serial queue implementation, with its queue tests retained.
- Collection display, cut collection and re-drop restore exactly one original-text card. Drag/drop used DOM events in the real Sandbox, not the OS mouse.
- Final 0.3.77 process restart retained 4 Palette items, Collection membership, 30 Canvas nodes, exactly one restored cut card, and metadata/Back content. Installed main.js, manifest.json and styles.css hashes matched the build.

## Measurements

Five direct decoration-refresh calls per Canvas size, with a pause between samples. Palette fixture contains three linked Card records, two imported to Side. These canvases were zoomed out and had no attached decoration layers during the size comparison. Numbers describe the eliminated offscreen work, not an overall FPS or CPU improvement.

| Canvas nodes | 0.3.76 refresh milliseconds | 0.3.77 refresh milliseconds |
|---|---|---|
| 30 | 9.6, 15.2, 20.8, 7.6, 24.6 | 3.5, 1.4, 0.3, 0.5, 1.4 |
| 300 | 50.9, 35.3, 60.3, 20.7, 52.1 | 0.3, 0.7, 0.5, 3.9, 0.8 |
| 1,000 | 42.2, 138.6, 166.1, 183.2, 148.2 | 1.9, 0.9, 1.7, 1.1, 1.6 |

A separate 30-node Canvas zoomed to show cards measured 3.2–15.3 ms before and 0.4–1.4 ms after, with unchanged visible decoration identity preserved only after the change.

Single exploratory UI samples (not statistical improvement claims): click-to-selection-and-two-frames 383.4 / 311.9 ms; wheel event to two frames 22.8 / 24.5 ms. Existing click disambiguation delay is included. Selection history was not reset between these exploratory samples. No general panning improvement is established. CDP focus emulation was used during UI checks to avoid background timer throttling, without operating the user's mouse.

## Verification limits

124 automated tests, TypeScript, build and diff checks passed. Runtime tests collected no relevant console errors/exceptions. This is targeted regression validation, not a full audit of all image/video sources or long-running memory usage. Search text loss and accidental deletion were not established in the original audit and are not claimed as fixed bugs.

After restart validation the Sandbox was stopped; all eight baseline configuration/plugin files were restored and their SHA-256 hashes matched. Four generated Canvas files and the test Palette data were moved into a separate temporary evidence folder, not deleted. The restored clean Sandbox is used for the subsequent public BRAT upgrade check.
