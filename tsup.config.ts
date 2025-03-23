import { defineConfig } from 'tsup'

export default defineConfig({
    noExternal: [
        /(.*)/
    ],
    dts: false,
    splitting: false,
    clean: false,
    skipNodeModulesBundle: true,
    shims: true,
    cjsInterop: false,
    target: "es2022",
    format: 'esm',
    outDir: "dist/",
    banner: {
        js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    outExtension({ format }) {
        return {
            js: `.mjs`,
        }
    },
})