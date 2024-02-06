import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { sh } from "./command";

export async function fromDirectory(output: string, dir: string, pattern: RegExp) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = dirents
    .filter(d => d.isFile() && pattern.test(d.name))
    .map(d => path.resolve(path.join(d.path, d.name)));

  fromFiles(output, ...files);
}

export function fromFiles(output: string, ...files: string[]) {
  const platform = os.platform();
  if (platform == "linux" || platform == "darwin") {
    sh(`zip --verbose --junk-paths ${output} ${files.join(" ")}`);
  } else if (os.platform() == "win32") {
    sh(`7z -y a ${output} ${files.join(" ")}`);
  }
}
