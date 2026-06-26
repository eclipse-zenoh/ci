import { readdirSync } from "fs";
import { defineConfig } from "tsup";

const entry = readdirSync("src")
  .filter(name => ["-pre.ts", "-main.ts", "-post.ts"].some(suffix => name.endsWith(suffix)))
  .map(name => `src/${name}`);

export default defineConfig({
  entry,
  noExternal: [/(.*)/],
  dts: false,
  splitting: false,
  clean: false,
  skipNodeModulesBundle: true,
  shims: true,
  cjsInterop: false,
  target: "es2022",
  format: ["esm"],
  outDir: "dist/",
  banner: {
    js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);`,
  },
  outExtension() {
    return {
      js: ".mjs",
    };
  },
});
