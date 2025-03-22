import { defineConfig } from 'tsup'

export default defineConfig({
    noExternal: [
        /(.*)/
    ],
    dts: false,
    splitting: true,
    clean: false,
    skipNodeModulesBundle: true,
    shims: true,
    cjsInterop: false,
    format: 'esm',
    banner: {
        js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
})