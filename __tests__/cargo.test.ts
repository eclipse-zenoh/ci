import { describe, expect, test } from "@jest/globals";

import { join } from "path";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { mkdtemp, realpath } from "fs/promises";
import { createWriteStream, rmSync } from "fs";
import * as https from "https";

import { run } from "../src/run";
import * as cargo from "../src/cargo";

export async function downloadGitHubRepo(repo: string, commit: string): Promise<string> {
  const url = `https://codeload.github.com/${repo}/tar.gz/${commit}`;

  let tmp = await mkdtemp(join(tmpdir(), commit));
  tmp = await realpath(tmp);

  return new Promise(resolve => {
    https.get(url, res => {
      const archiveName = join(tmp, "archive.tar.gz");
      const archive = createWriteStream(archiveName);
      res.pipe(archive);
      archive.on("finish", () => {
        archive.close();
        run("tar", ["-x", "-z", "-f", archiveName], { cwd: tmp });
        rmSync(archiveName);
        resolve(join(tmp, `${repo.split("/").at(1)}-${commit}`));
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
    const tmp = await downloadGitHubRepo(
      "eclipse-zenoh/zenoh-backend-s3",
      "3761d5986fa12318e175341bc97524fe5a961cfa",
    );

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
    const tmp = await downloadGitHubRepo(
      "eclipse-zenoh/zenoh",
      "8cd786f2192fd2aa7387432ae93cdd78f5db1df2",
    );
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

  test("bump deps debian zenoh-kotlin", async () => {
    const tmp = await downloadGitHubRepo(
      "eclipse-zenoh/zenoh-kotlin",
      "836d778a515939a469b7c6f05c36a63814e98050",
    );

    await cargo.bumpDebianDependencies(join(tmp, "zenoh-jni"), /zenoh.*/g, "1.2.3-beta.0");
  });
});
