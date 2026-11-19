# How the engine works

A deck is a 1920×1080 stage scaled to the window. Each scene is a React component that builds one GSAP timeline in `useScene((tl, q) => …)`. The timeline is paused and has labels: `s0` is the end of the entrance, `s1`, `s2`, … the end of each step. The engine never plays a timeline freely, it only moves the playhead.

- **→** tweens the playhead to the next label (`tl.tweenTo("s1")`). While a part is still playing, a press is ignored: presenters skipped their best animations by accident when a press fast-finished them. Shift+→ finishes the part on purpose. After the last step, → goes to the next scene through a transition.
- **←** steps back with a short tween; at step 0 it fades to the previous scene at its last label.
- **Jumps, search and export** seek: `tl.pause(); tl.seek(t, false)`. Seeking with events matters, because `tl.pause(t)` suppresses callbacks and counters freeze at the wrong value. Counters never write text when the scene is built; the markup holds the start value.
- **Export** calls `__deck.show(i, "end")` for every scene and screenshots it, so every scene needs an end state that explains itself on paper. `#print` shows the same thing in the browser.

The step bars in the corner fill from the timeline segments in real time. When the next bar pulses, the animation is done and → is safe; the presenter window shows the same cue.

Clicks on the stage never advance: a presenter touching the touchpad moved the deck on. Keys and presentation remotes do.

`scripts/seek_check.py` checks that forward, back and a jump give the same DOM at every label. `scripts/walk.py` presses → through the whole deck and checks the input rules.
