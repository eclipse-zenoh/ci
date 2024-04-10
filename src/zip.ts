import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { sh } from "./command";

export async function fromDirectory(output: string, dir: string, pattern: RegExp) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = dirents.filter(d => pattern.test(d.name)).map(d => path.resolve(path.join(d.path, d.name)));

  fromFiles(output, ...files);
}

export function fromFiles(output: string, ...files: string[]) {
  if (files.length === 0) {
    // NOTE: If the files array is empty, 7-Zip will scan the current directory
    // for files and directories to add to the archive, while Info-ZIP will
    // return a non-zero exit code
    throw new Error("Attempt to create empty ZIP archive");
  }

  const platform = os.platform();
  if (platform == "linux" || platform == "darwin") {
    sh(`zip --verbose --junk-paths ${output} ${files.join(" ")}`);
  } else if (os.platform() == "win32") {
    sh(`7z -y a ${output} ${files.join(" ")}`);
  }
}
