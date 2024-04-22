import { describe, expect, test } from "@jest/globals";

import { join } from "path";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { mkdtemp, realpath } from "fs/promises";
import { createWriteStream, rmSync } from "fs";
import * as https from "https";

import { sh } from "../src/command";
import * as cargo from "../src/cargo";
import { TOML } from "../src/toml";

const toml = new TOML();

export async function downloadGitHubRepo(repo: string, ref: string): Promise<string> {
  const url = `https://codeload.github.com/${repo}/tar.gz/${ref}`;

  let tmp = await mkdtemp(join(tmpdir(), "git"));
  tmp = await realpath(tmp);

  return new Promise(resolve => {
    https.get(url, res => {
      const archiveName = join(tmp, "archive.tar.gz");
      const archive = createWriteStream(archiveName);
      res.pipe(archive);
      archive.on("finish", () => {
        archive.close();
        sh(`tar -x -f ${archiveName}`, { cwd: tmp });
        rmSync(archiveName);
        resolve(join(tmp, `${repo.split("/").at(1)}-${ref}`));
      });
    });
  });
}

describe("cargo", () => {
  test("list packages zenoh-plugin-ros2dds", async () => {
    const tmp = await downloadGitHubRepo(
      "eclipse-zenoh/zenoh-plugin-ros2dds",
      "ca44eb44a96f855cfbf53bf5f4813194e2f16bd5",
    );

    const packages = cargo.packages(tmp);
    await rm(tmp, { recursive: true, force: true });

    const expectedPackages = [
      {
        name: "zenoh-plugin-ros2dds",
        version: "0.11.0-dev",
        manifestPath: `${tmp}/zenoh-plugin-ros2dds/Cargo.toml`,
        publish: undefined,
        workspaceDependencies: [],
      },
      {
        name: "zenoh-bridge-ros2dds",
        version: "0.11.0-dev",
        manifestPath: `${tmp}/zenoh-bridge-ros2dds/Cargo.toml`,
        publish: undefined,
        workspaceDependencies: [
          {
            name: "zenoh-plugin-ros2dds",
            path: `${tmp}/zenoh-plugin-ros2dds`,
            req: "^0.11.0-dev",
          },
        ],
      },
    ];
    const compareFn = (p: cargo.Package, q: cargo.Package) => p.name.localeCompare(q.name);
    expect(packages.sort(compareFn)).toStrictEqual(expectedPackages.sort(compareFn));
  });

  test("list packages zenoh-backend-s3", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-backend-s3", "3761d5986fa12318e175341bc97524fe5a961cfa");

    const packages = cargo.packages(tmp);
    await rm(tmp, { recursive: true, force: true });

    const expectedPackages = [
      {
        name: "zenoh-backend-s3",
        version: "0.11.0-dev",
        manifestPath: `${tmp}/Cargo.toml`,
        publish: undefined,
        workspaceDependencies: [],
      },
    ];
    expect(packages).toStrictEqual(expectedPackages);
  });

  test("list packages zenoh", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh", "8cd786f2192fd2aa7387432ae93cdd78f5db1df2");
    const order = [...cargo.packagesOrdered(tmp)].map(p => p.name);
    await rm(tmp, { recursive: true, force: true });
    const expectedOrder = [
      "zenoh-collections",
      "zenoh-result",
      "zenoh-core",
      "zenoh-crypto",
      "zenoh-buffers",
      "zenoh-keyexpr",
      "zenoh-macros",
      "zenoh-protocol",
      "zenoh-util",
      "zenoh-plugin-trait",
      "zenoh-shm",
      "zenoh-sync",
      "zenoh-codec",
      "zenoh-link-commons",
      "zenoh-link-tcp",
      "zenoh-link-udp",
      "zenoh-link-unixsock_stream",
      "zenoh-config",
      "zenoh-link-quic",
      "zenoh-link-tls",
      "zenoh-link-ws",
      "zenoh-link-serial",
      "zenoh-link-unixpipe",
      "zenoh-link",
      "zenoh-transport",
      "zenoh",
      "zenoh_backend_traits",
      "zenoh-plugin-rest",
      "zenohd",
      "zenoh-ext",
      "zenoh-plugin-example",
      "zenoh-examples",
      "zenoh-plugin-storage-manager",
      "zenoh-backend-example",
    ];
    expect(order).toStrictEqual(expectedOrder);
  });

  test("bump zenoh-kotlin", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-kotlin", "6ba9cf6e058c959614bd7f1f4148e8fa39ef1681");

    const version = "1.2.3-beta.1";
    const path = join(tmp, "zenoh-jni");
    await cargo.bump(path, version);

    expect(toml.get(`${path}/Cargo.toml`, ["package", "version"])).toEqual(version);
  });

  test("bump deps zenoh-kotlin", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-kotlin", "6ba9cf6e058c959614bd7f1f4148e8fa39ef1681");

    const version = "1.2.3-beta.1";
    const path = join(tmp, "zenoh-jni");
    await cargo.bumpDependencies(path, /zenoh.*/, version);

    expect(toml.get(`${path}/Cargo.toml`, ["dependencies", "zenoh", "version"])).toEqual(version);
    expect(toml.get(`${path}/Cargo.toml`, ["dependencies", "zenoh-ext", "version"])).toEqual(version);
  });
});
