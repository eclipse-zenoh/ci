#!/usr/bin/env node

const fs = require("fs/promises");
const child_process = require("child_process");

async function main() {
  const dir = await fs.opendir("src");
  for await (const dirent of dir) {
    if (["-pre.ts", "-main.ts", "-post.ts"].some(x => dirent.name.endsWith(x))) {
      child_process.exec(`tsup src/${dirent.name} --out-dir dist --format esm`, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
      });
    }
  }
}

main().then();
