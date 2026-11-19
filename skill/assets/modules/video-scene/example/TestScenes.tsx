/**
 * The test deck used to verify the module (scenes: start, vcard, vmorph, vmissing, finish; meta: steps 0, full, twoPage).
 * Video: tools/make-test-video.sh public/media/test.mp4 src/assets/test-poster.jpg
 */
import { SceneRoot, useScene } from "../deck";
import { makeVideoScene, BrowserFrame, Caption } from "../video-scene";
import poster from "../assets/test-poster.jpg";

const CHAPTERS = [
  { t: 0, title: "Intro" }, { t: 2, title: "Red" }, { t: 6, title: "Green" },
  { t: 10, title: "Blue" }, { t: 14, title: "Purple" }, { t: 17, title: "Outro" },
];

/** A light scene with a card that the next scene (card intro) opens from. */
export function Start() {
  const ref = useScene((tl, q) => {
    tl.from(q(".vt-h"), { y: 30, autoAlpha: 0, duration: 0.5 }, 0.1).from(q(".vt-card"), { y: 40, autoAlpha: 0, duration: 0.6 }, 0.3);
  });
  return (
    <SceneRoot ref={ref}>
      <h1 className="vt-h h1 absolute left-[120px] top-[160px] m-0">Test deck for the video scene</h1>
      <BrowserFrame className="vt-card" src={poster} width={880} url="example.com/demo" style={{ position: "absolute", left: 120, top: 340 }} />
      <Caption bottom={90}>Watch the demo</Caption>
    </SceneRoot>
  );
}

const Logo = ({ outer }: { outer: string }) => (
  <svg viewBox="0 0 160 160" aria-hidden><rect width="160" height="160" fill={outer} /><rect x="40" y="40" width="80" height="80" fill="#fff" /></svg>
);

export const VCard = makeVideoScene({
  src: "media/test.mp4", poster, chapters: CHAPTERS, videoSize: { w: 1280, h: 720 }, duration: 20, startAt: 2.2,
  intro: { kind: "card", from: ".vt-card" }, outro: { at: 17.2, text: "card outro" },
});

export const VMorph = makeVideoScene({
  src: "media/test.mp4", poster, chapters: CHAPTERS, videoSize: { w: 1280, h: 720 }, duration: 20, startAt: 0.5,
  intro: {
    kind: "morph", target: { x: 560, y: 280, w: 160, h: 160 }, reveal: "#EDE6D8",
    mark: <Logo outer="#3B82F6" />, markLanded: <Logo outer="#E0703A" />, eyebrow: "Demo · sound on",
    lockup: <span style={{ position: "absolute", left: 1220, top: 610, fontSize: 40, fontWeight: 700, color: "#222" }}>wordmark</span>,
  },
  outro: { at: 17.5, text: "example.com" },
});

export const VMissing = makeVideoScene({
  src: "media/missing.mp4", poster, chapters: CHAPTERS, duration: 20,
  intro: { kind: "fade", eyebrow: "Demo", title: "The missing file" },
});

export function Finish() {
  const ref = useScene((tl, q) => { tl.from(q(".vt-h"), { y: 30, autoAlpha: 0, duration: 0.5 }, 0.1); });
  return <SceneRoot ref={ref}><h1 className="vt-h h1 absolute left-[120px] top-[400px] m-0">The end</h1></SceneRoot>;
}
