import { PathLike } from "node:fs";
import * as crypto from "crypto";
import * as fs from "fs/promises";

export async function sha256(path: PathLike | fs.FileHandle) {
  const contents = await fs.readFile(path);
  return crypto.createHash("sha256").update(contents).digest("hex");
}
