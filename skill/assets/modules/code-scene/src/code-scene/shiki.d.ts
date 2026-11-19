// Types for `import code from "./file.go?shiki"` (see vite-plugin-code-scene.ts).
// Put `shiki` LAST in the query: "./a.go?shiki", "./a.go?lang=go&shiki", "./before.go?after=./after.go&shiki".
declare module "*?shiki" {
  const code: import("./types").HighlightedCode;
  export default code;
}
declare module "*&shiki" {
  const code: import("./types").HighlightedCode;
  export default code;
}
