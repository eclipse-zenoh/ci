import * as child_process from "child_process";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import * as core from "@actions/core";

const name = "kellnr";
const baseUrl = "localhost";
const index = `sparse+https://${baseUrl}:8000/api/v1/crates/`;
const token = "Zy9HhJ02RJmg0GCrgLfaCVfU6IwDfhXD"; // default admin token from kellnr
const indexPath = "index";
const cratePath = "crate";

export type Kellnr = {
  name: string;
  index: string;
  token: string;
  indexDir: string;
  crateDir: string;
  proc: child_process.ChildProcess;
};

export async function spawn(): Promise<Kellnr> {
  const tmp = await mkdtemp(join(tmpdir(), name));
  const indexDir = join(tmp, indexPath);
  const crateDir = join(tmp, cratePath);

  const options = {
    env: {
      PATH: process.env.PATH,
      RUST_LOG: "debug",
      KELLNR_REGISTRY__DATA_DIR: crateDir,
    },
    stdio: "inherit",
  } as child_process.SpawnOptions;

  const proc = child_process.spawn(
    "docker run --rm -it --name kellnr",
    ["-p", "8000:8000", "-e", `KELLNR_ORIGIN__HOSTNAME=${baseUrl}`, "ghcr.io/kellnr/kellnr:5"],
    options,
  );

  core.info(`Spawned kellnr (${proc.pid}) with base URL ${baseUrl} and data directory ${tmp}`);

  return { name, index, token, crateDir, indexDir, proc };
}
