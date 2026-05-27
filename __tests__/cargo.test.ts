import { describe, expect, test } from "@jest/globals";

import { join } from "path";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { mkdir, mkdtemp, writeFile, realpath } from "fs/promises";
import { createWriteStream, rmSync } from "fs";
import * as https from "https";

import { sh } from "../src/command";
import * as cargo from "../src/cargo";
import { TOML } from "../src/toml";

const toml = await TOML.init();

const SHA_ZENOH: string = "a6d75a06abaa4d97de02eb8e89cee330b21a0447";
const SHA_ZENOH_C: string = "ffa4bddc947f7ed6c0e3b4546205dd1b73e7df81";
const SHA_ZENOH_TS: string = "d0ee49fd8ccb4016d90b03be431de4c3cb087bdd";
const SHA_ZENOH_KOTLIN: string = "6ba9cf6e058c959614bd7f1f4148e8fa39ef1681";
const SHA_ZENOH_PLUGIN_MQTT: string = "f38489f60911fa78befd3c073511bedb764f99f9";
const SHA_ZENOH_PLUGIN_ROS2DDS: string = "ca44eb44a96f855cfbf53bf5f4813194e2f16bd5";
const SECONDS = 1000;

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
  test(
    "list packages zenoh-plugin-ros2dds",
    async () => {
      const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-plugin-ros2dds", SHA_ZENOH_PLUGIN_ROS2DDS);

      const packages = cargo.packages(tmp);
      try {
        await rm(tmp, { recursive: true, force: true });
      } catch (e) {
        console.log(e);
      }

      const expectedPackages = [
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
        {
          name: "zenoh-plugin-ros2dds",
          version: "0.11.0-dev",
          manifestPath: `${tmp}/zenoh-plugin-ros2dds/Cargo.toml`,
          publish: undefined,
          workspaceDependencies: [],
        },
      ];
      expect(packages).toStrictEqual(expectedPackages);
    },
    60 * SECONDS,
  );

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

  test("bump zenoh-kotlin", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-kotlin", SHA_ZENOH_KOTLIN);

    const version = "1.2.3-beta.1";
    const path = join(tmp, "zenoh-jni");
    await cargo.bump(path, version);

    expect(toml.get(`${path}/Cargo.toml`, ["package", "version"])).toEqual(version);
  });

  test("bump deps zenoh-kotlin", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-kotlin", SHA_ZENOH_KOTLIN);

    const version = "1.2.3-beta.1";
    const path = join(tmp, "zenoh-jni");
    await cargo.bumpDependencies(path, /zenoh.*/, version);

    expect(toml.get(`${path}/Cargo.toml`, ["dependencies", "zenoh", "version"])).toEqual(version);
    expect(toml.get(`${path}/Cargo.toml`, ["dependencies", "zenoh-ext", "version"])).toEqual(version);
  });

  test(
    "bump deps zenoh",
    async () => {
      const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh", SHA_ZENOH);

      const version = "1.2.3-beta.1";
      const debian_version = "1.2.3~beta.1-1";
      await cargo.bumpDependencies(tmp, /zenoh.*/, version);

      // zenoh versions are pinned with "=", so we expect the bumped version to be pinned as well
      expect(toml.get(`${tmp}/Cargo.toml`, ["workspace", "dependencies", "zenoh", "version"])).toEqual(`=${version}`);
      expect(toml.get(`${tmp}/zenoh/Cargo.toml`, ["package", "metadata", "deb", "depends"])).toEqual(
        `zenohd (=${debian_version}), zenoh-plugin-rest (=${debian_version}), zenoh-plugin-storage-manager (=${debian_version})`,
      );
    },
    60 * SECONDS,
  );

  test("bump deps handles string, pinned, and non-versioned dependency forms", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "cargo-bump-deps-"));
    const manifestPath = join(tmp, "Cargo.toml");

    await mkdir(join(tmp, "src"), { recursive: true });
    await mkdir(join(tmp, "commons", "zenoh-test", "src"), { recursive: true });
    await writeFile(
      manifestPath,
      `
  [package]
  name = "test-crate"
  version = "0.1.0"
  edition = "2021"
  [dependencies]
  zenoh = "=1.0.0"
  zenoh-ext = "1.0.0"
  zenoh-test = { path = "commons/zenoh-test" }
  `,
    );
    await writeFile(join(tmp, "src", "lib.rs"), "pub fn test_crate() {}\n");
    await writeFile(
      join(tmp, "commons", "zenoh-test", "Cargo.toml"),
      `
  [package]
  name = "zenoh-test"
  version = "0.1.0"
  edition = "2021"
  [lib]
  path = "src/lib.rs"
  `,
    );
    await writeFile(join(tmp, "commons", "zenoh-test", "src", "lib.rs"), "pub fn zenoh_test() {}\n");
    await cargo.bumpDependencies(tmp, /zenoh.*/, "1.2.3-beta.1");
    expect(toml.get(manifestPath, ["dependencies", "zenoh", "version"])).toEqual("=1.2.3-beta.1");
    expect(toml.get(manifestPath, ["dependencies", "zenoh-ext", "version"])).toEqual("1.2.3-beta.1");
    expect(toml.get(manifestPath, ["dependencies", "zenoh-test", "version"])).toBeNull();
  });

  test("toDebianVersion()", async () => {
    expect(cargo.toDebianVersion("1.0.0")).toEqual("1.0.0");
    expect(cargo.toDebianVersion("1.0.0.0")).toEqual("1.0.0~dev-1");
    expect(cargo.toDebianVersion("1.0.0.1")).toEqual("1.0.0~pre.1-1");
    expect(cargo.toDebianVersion("1.0.0.1", 2)).toEqual("1.0.0~pre.1-2");
    expect(cargo.toDebianVersion("1.0.0.11")).toEqual("1.0.0~pre.11-1");
    expect(cargo.toDebianVersion("1.0.0-alpha.1")).toEqual("1.0.0~alpha.1-1");
    expect(cargo.toDebianVersion("1.0.0-beta.1")).toEqual("1.0.0~beta.1-1");
    expect(cargo.toDebianVersion("1.0.0-rc.1")).toEqual("1.0.0~rc.1-1");
    expect(cargo.toDebianVersion("1.0.0-1-g7591ec739")).toEqual("1.0.0+1.g7591ec739-1");
    expect(cargo.toDebianVersion("1.0.0-1-g7591ec739", 2)).toEqual("1.0.0+1.g7591ec739-2");
  });

  test("setCargoLockVersion()", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-plugin-mqtt", SHA_ZENOH_PLUGIN_MQTT);

    const path = join(tmp, "Cargo.lock");
    cargo.setCargoLockVersion(path);

    const version = toml.get(path, ["version"]);
    expect(version).toStrictEqual(3);
  });

  test("setGitBranch() build-dependencies", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-c", SHA_ZENOH_C);
    const path = join(tmp, "Cargo.toml");
    const expectedGitUrl = "https://foo.bar";
    const expectedBranch = "foo-branch";
    await cargo.setGitBranch(path, new RegExp("zenoh.*"), expectedGitUrl, expectedBranch);

    const gitUrl = toml.get(path, ["build-dependencies", "zenoh", "git"]);
    const branch = toml.get(path, ["build-dependencies", "zenoh", "branch"]);
    expect(gitUrl).toStrictEqual(expectedGitUrl);
    expect(branch).toStrictEqual(expectedBranch);
  });

  test("setGitBranch() workspace.metadata.bin", async () => {
    const tmp = await downloadGitHubRepo("eclipse-zenoh/zenoh-ts", SHA_ZENOH_TS);
    const path = join(tmp, "Cargo.toml");
    const expectedGitUrl = "https://foo.bar";
    const expectedBranch = "foo-branch";
    await cargo.setGitBranch(path, new RegExp("zenoh.*"), expectedGitUrl, expectedBranch);

    const gitUrl = toml.get(path, ["workspace", "metadata", "bin", "zenohd", "git"]);
    const branch = toml.get(path, ["workspace", "metadata", "bin", "zenohd", "branch"]);
    expect(gitUrl).toStrictEqual(expectedGitUrl);
    expect(branch).toStrictEqual(expectedBranch);
  });
});
