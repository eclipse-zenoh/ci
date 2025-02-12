import * as fs from "fs/promises";

import { exec } from "./command";
import * as cargo from "./cargo";

export class TOML {
  static async init(): Promise<TOML> {
    await cargo.installBinaryCached("toml-cli2");
    return new TOML();
  }

  get(path: string, key?: string[]): Record<string, unknown> {
    const query = key == undefined ? "." : key.join(".");
    const out = exec("toml", ["get", path, query], { check: false });
    if (out) {
      return JSON.parse(out) as Record<string, unknown>;
    }
  }

  async set(path: string, key: string[], value: string) {
    const query = key.join(".");
    await fs.writeFile(path, exec("toml", ["set", path, query, value]));
  }

  async unset(path: string, key: string[]) {
    const query = key.join(".");
    await fs.writeFile(path, exec("toml", ["unset", path, query]));
  }
}
