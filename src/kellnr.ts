import * as child_process from "child_process";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import fetch from "node-fetch";

import * as core from "@actions/core";

const name = "kellnr";
const baseUrl = "localhost";
const index = `sparse+http://${baseUrl}:8000/api/v1/crates/`;
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

async function waitForService(url: string, maxAttempts = 120, interval = 1000): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://${url}:8000/api/v1/health`);
      if (response.ok) {
        return true;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Ignore connection errors and retry
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

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
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      "kellnr",
      "-p",
      "8000:8000",
      "-e",
      `KELLNR_ORIGIN__HOSTNAME=${baseUrl}`,
      "ghcr.io/kellnr/kellnr:5",
    ],
    options,
  );

  // Wait for the service to be ready
  const isReady = await waitForService(baseUrl);
  if (!isReady) {
    throw new Error("Kellnr service failed to start within the timeout period");
  }

  core.info(`Spawned kellnr (${proc.pid}) with base URL ${baseUrl} and data directory ${tmp}`);

  return { name, index, token, crateDir, indexDir, proc };
}
