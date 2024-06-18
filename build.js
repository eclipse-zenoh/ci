#!/usr/bin/env node

const fs = require("fs/promises");
const child_process = require("child_process");

async function main() {
  const dir = await fs.opendir("src");
  for await (const dirent of dir) {
    if (["-pre.ts", "-main.ts", "-post.ts"].some(x => dirent.name.endsWith(x))) {
      console.log(`> Transpiling ${dirent.name}`);
      child_process.exec(`tsup src/${dirent.name} --out-dir dist --format esm`, { stdio: "inherit" });
    }
  }
}

main().then();
