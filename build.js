#!/usr/bin/env node

const fs = require("fs/promises");
const child_process = require("child_process");

async function main() {
  const dir = await fs.opendir("src");
  for await (const dirent of dir) {
    if (dirent.name.endsWith("-main.ts")) {
      console.log(`> Transpiling ${dirent.name}`);
      child_process.execSync(`ncc build src/${dirent.name} --out dist`);
      const name = dirent.name.replace("ts", "js");
      fs.rename("dist/index.js", `dist/${name}`);
      console.log(`> Generated dist/${name}`);
    }
  }
}

main().then();
