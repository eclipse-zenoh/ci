import { existsSync } from "fs";
import * as fs from "fs/promises";

import * as core from "@actions/core";

import * as cargo from "./cargo";
import { sh } from "./command";
import { gitEnv } from "./config";
import { TOML } from "./toml";

const toml = await TOML.init();

export type Input = {
  cargoVersion: string;
  cmakeVersion?: string;
  branch?: string;
  zenohCBranch?: string;
  zenohPicoBranch?: string;
  bumpDepsRegExp?: RegExp;
  bumpDepsVersion?: string;
  bumpDepsBranch?: string;
};

export function setup(): Input {
  const cargoVersion = core.getInput("cargo-version", { required: true });
  const cmakeVersion = core.getInput("cmake-version");
  const branch = core.getInput("branch");
  const zenohCBranch = core.getInput("zenoh-c-branch");
  const zenohPicoBranch = core.getInput("zenoh-pico-branch");
  const bumpDepsPattern = core.getInput("bump-deps-pattern");
  const bumpDepsVersion = core.getInput("bump-deps-version");
  const bumpDepsBranch = core.getInput("bump-deps-branch");

  return {
    cargoVersion,
    cmakeVersion: cmakeVersion === "" ? undefined : cmakeVersion,
    branch: branch === "" ? undefined : branch,
    zenohCBranch: zenohCBranch === "" ? undefined : zenohCBranch,
    zenohPicoBranch: zenohPicoBranch === "" ? undefined : zenohPicoBranch,
    bumpDepsRegExp: bumpDepsPattern === "" ? undefined : new RegExp(bumpDepsPattern),
    bumpDepsVersion: bumpDepsVersion === "" ? undefined : bumpDepsVersion,
    bumpDepsBranch: bumpDepsBranch === "" ? undefined : bumpDepsBranch,
  };
}

export async function main(input: Input) {
  try {
    const workspace = ".";
    const gitOptions = { cwd: workspace, env: gitEnv, check: false };
    if (input.cmakeVersion) {
      // Common to all CMake based projects
      await fs.writeFile("version.txt", `${input.cmakeVersion}`);
      sh(`git commit version.txt --message 'chore: Bump version to \`${input.cmakeVersion}\`'`, gitOptions);

      // zenoh-cpp specific
      // FIXME: this is not quite the same as zenoh-cpp/ci/scripts/bump-and-tag.bash yet
      // In the current version, the bash script doesn't commit the changes to the zenoh-*-branch.txt files.
      // Check with Mahmoud if this is a bug in the script of intended behavior
      if (existsSync("zenoh-cpp-branch.txt")) {
        if (input.branch != undefined) {
          await fs.writeFile("zenoh-cpp-branch.txt", `${input.branch}`);
        }

        if (input.zenohCBranch != undefined) {
          await fs.writeFile("zenoh-c-branch.txt", `${input.zenohCBranch}`);
        }

        if (input.zenohPicoBranch != undefined) {
          await fs.writeFile("zenoh-pico-branch.txt", `${input.zenohPicoBranch}`);
        }

        sh("git add .", { cwd: workspace });
        sh(`git commit --message 'chore: Update zenoh-cpp, zenoh-c and zenoh-pico branches.'`, gitOptions);
      }

      // zenoh-c specific
      // Check if Cargo.toml.in exist at the root of the checkout and assume this is a zenoh-c checkout
      if (existsSync("Cargo.toml.in")) {
        // Propagate version change to Cargo.toml and Cargo.toml.in
        sh("cmake . -DZENOHC_BUILD_IN_SOURCE_TREE=TRUE -DCMAKE_BUILD_TYPE=Release", { cwd: workspace });
        // Update Debian dependency of libzenohc-dev
        const deb_version = cargo.toDebianVersion(input.cargoVersion);
        await toml.set(
          "Cargo.toml",
          ["package", "metadata", "deb", "variants", "libzenohc-dev", "depends"],
          `libzenohc (=${deb_version})`,
        );
        await toml.set(
          "Cargo.toml.in",
          ["package", "metadata", "deb", "variants", "libzenohc-dev", "depends"],
          `libzenohc (=${deb_version})`,
        );

        sh(
          `git commit Cargo.toml Cargo.toml.in Cargo.lock --message 'chore: Bump libzenohc-dev version to \`${deb_version}\`'`,
          gitOptions,
        );

        // Select all package dependencies that match $bump_deps_pattern and bump them to $bump_deps_version
        if (input.bumpDepsRegExp != undefined) {
          await cargo.bumpDependencies(workspace, input.bumpDepsRegExp, input.bumpDepsVersion, input.bumpDepsBranch);
          // FIXME: Need to call for both Cargo.toml and Cargo.toml.in
          // await cargo.bumpDependencies(workspace, input.bumpDepsRegExp, input.bumpDepsVersion, input.bumpDepsBranch);
          sh("git add Cargo.toml", { cwd: workspace });
          sh(
            `git commit --message 'chore: Bump \`${input.bumpDepsRegExp}\` dependencies to \`${input.bumpDepsVersion}\`'`,
            gitOptions,
          );

          // Update lockfile
          // FIXME: Bumping the version before zenoh is released causes cargo check to return an error. Ignore for now
          sh("cargo check", { cwd: workspace, check: false });
          sh(
            `git commit Cargo.toml Cargo.toml.in Cargo.lock --message 'chore: Bump \`${input.bumpDepsRegExp}\` version to \`${input.bumpDepsVersion}\`'`,
            gitOptions,
          );
        }
      }
    } else {
      await cargo.bump(workspace, input.cargoVersion);
      sh("git add .", { cwd: workspace });
      sh(`git commit --message 'chore: Bump version to \`${input.cargoVersion}\`'`, gitOptions);

      if (input.bumpDepsRegExp != undefined) {
        await cargo.bumpDependencies(workspace, input.bumpDepsRegExp, input.bumpDepsVersion, input.bumpDepsBranch);
        sh("git add .", { cwd: workspace });
        sh(
          `git commit --message 'chore: Bump ${input.bumpDepsRegExp} dependencies to \`${input.bumpDepsVersion}\`'`,
          gitOptions,
        );

        sh("cargo check", { cwd: workspace });
        sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", gitOptions);
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}
