// The test deck for tests/drive.py: copy over src/scenes/index.ts in a scratch copy of the starter
// (TestScenes.tsx next to it; video + poster from tools/make-test-video.sh). Order matters to the test.
import type { SceneDef } from "../deck";
import { Cover } from "./Cover";
import { Results } from "./Results";
import { BackupMethod } from "./BackupMethod";
import { Start, VCard, VMorph, VMissing, Finish } from "./TestScenes";

export const scenes: SceneDef[] = [
  { id: "start", title: "Start", steps: 0, notes: ["start"], Component: Start },
  { id: "vcard", title: "Video (card)", steps: 0, full: true, twoPage: true, notes: ["card intro"], Component: VCard },
  { id: "vmorph", title: "Video (morph)", steps: 0, full: true, twoPage: true, notes: ["morph intro"], Component: VMorph },
  { id: "vmissing", title: "Video (missing)", steps: 0, full: true, twoPage: true, notes: ["missing file"], Component: VMissing },
  { id: "finish", title: "Finish", steps: 0, notes: ["end"], Component: Finish },
  { id: "cover", title: "Cover", steps: 0, notes: ["cover"], Component: Cover },
  { id: "results", title: "Results", steps: 2, notes: ["a", "b", "c"], Component: Results },
  { id: "backup-method", title: "Method", steps: 0, appendix: true, notes: ["method"], Component: BackupMethod },
];
