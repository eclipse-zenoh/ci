import * as child_process from "child_process";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import * as core from "@actions/core";

import * as cargo from "./cargo";

const name = "estuary";
const baseUrl = "http://localhost:7878";
const index = `${baseUrl}/git/index`;
const token = "0000";
const indexPath = "index";
const cratePath = "crate";
const gitUrl = "https://github.com/fuzzypixelz/estuary.git";
const gitBranch = "main";

export type Estuary = {
  name: string;
  index: string;
  token: string;
  indexDir: string;
  crateDir: string;
  proc: child_process.ChildProcess;
};

export async function spawn(): Promise<Estuary> {
  const tmp = await mkdtemp(join(tmpdir(), name));
  const indexDir = join(tmp, indexPath);
  const crateDir = join(tmp, cratePath);

  const options = {
    env: {
      PATH: process.env.PATH,
      RUST_LOG: "debug",
    },
    stdio: "inherit",
  } as child_process.SpawnOptions;

  await cargo.installBinaryCached(name, { gitUrl: gitUrl, gitBranch: gitBranch });

  const proc = child_process.spawn(
    "estuary",
    ["--base-url", baseUrl, "--crate-dir", crateDir, "--index-dir", indexDir],
    options,
  );

  core.info(`Spawned estuary (${proc.pid}) with base URL ${baseUrl} and data directory ${tmp}`);

  return { name, index, token, crateDir, indexDir, proc };
}
