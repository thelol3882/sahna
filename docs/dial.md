# The creative dial

`DECK.style` is `academic`, `balanced` or `showcase`, and `?style=` previews another setting without editing. It is the only place where boldness is decided.

Scenes never branch on the style. Components ask `allow(feature)` and step down by themselves:

| feature | showcase | balanced | academic |
|---|---|---|---|
| transitions at a speaker change | WebGL shader | overlay (wipe, curtain) | push or rise |
| headline | decode | masked line reveal | rise |
| light | aurora, beams, spotlight | beams on diagrams | none |
| cards | glass | solid | solid |
| dark scenes | all | cover and end | none |
| spatial world | 3D | 2.5D pan and zoom | off |

Shaders compile and run a short benchmark at load. If the GPU misses the budget, showcase plays the overlay fallback, so a weak laptop gets a calmer deck, not a broken one. Reduced motion turns every transition into a fade.

Some things are on at every setting: text sizes for the back row, contrast checked with a projector simulation, keys only, clean export end states and one GPU-heavy effect per scene.

The checks run per setting (`npx sahna check --style all`), because a deck made for showcase may still end up on a classroom projector.
