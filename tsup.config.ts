import { defineConfig } from 'tsup'

export default defineConfig({
    noExternal: [
        /(.*)/
    ],
    dts: false,
    splitting: false,
    clean: false,
    skipNodeModulesBundle: true
})