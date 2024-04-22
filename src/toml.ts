import * as fs from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";

export class TOML {
  constructor() {
    cargo
      .installBinaryCached("toml-cli2")
      .then(() => core.info("Successfully installed toml-cli2"))
      .catch(reason => {
        throw new Error(`Could not install toml-cli2: ${reason}`);
      });
  }

  get(path: string, key?: string[]): Record<string, unknown> {
    const query = key == undefined ? "." : key.join(".");
    return JSON.parse(sh(`toml get ${path} ${query}`)) as Record<string, unknown>;
  }

  async set(path: string, key: string[], value: string) {
    const query = key.join(".");
    await fs.writeFile(path, sh(`toml set ${path} ${query} ${value}`));
  }

  async unset(path: string, key: string[]) {
    const query = key.join(".");
    await fs.writeFile(path, sh(`toml unset ${path} ${query}`));
  }
}
