import * as fs from "fs/promises";
import * as os from "os";

import { sh } from "./command";

/**
 * Create a ZIP archive from a directory.
 *
 * @param output Absolute path to the output ZIP archive name.
 * @param dir Directory containing files to add to the archive.
 * @param pattern Pattern of files to be added to the archive.
 */
export async function fromDirectory(output: string, dir: string, pattern: RegExp) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = dirents.filter(d => pattern.test(d.name)).map(d => d.name);

  if (files.length === 0) {
    // NOTE: If the files array is empty, 7-Zip will scan the current directory
    // for files and directories to add to the archive, while Info-ZIP will
    // return a non-zero exit code
    throw new Error("Attempt to create empty ZIP archive");
  }

  const platform = os.platform();
  if (platform == "linux" || platform == "darwin") {
    sh(`zip --verbose --recurse-paths ${output} ${files.join(" ")}`, { cwd: dir });
  } else if (os.platform() == "win32") {
    sh(`7z -y -r a ${output} ${files.join(" ")}`, { cwd: dir });
  }
}
