import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";
import { gitEnv } from "./config";

export type Input = {
  version: string;
  bumpDepsRegExp?: RegExp;
  bumpDepsVersion?: string;
  bumpDepsBranch?: string;
};

export function setup(): Input {
  const version = core.getInput("version", { required: true });
  const bumpDepsPattern = core.getInput("bump-deps-pattern");
  const bumpDepsVersion = core.getInput("bump-deps-version");
  const bumpDepsBranch = core.getInput("bump-deps-branch");

  return {
    version,
    bumpDepsRegExp: bumpDepsPattern === "" ? undefined : new RegExp(bumpDepsPattern),
    bumpDepsVersion: bumpDepsVersion === "" ? undefined : bumpDepsVersion,
    bumpDepsBranch: bumpDepsBranch === "" ? undefined : bumpDepsBranch,
  };
}

export async function main(input: Input) {
  try {
    const workspace = "."
    await cargo.bump(workspace, input.version);
    sh("git add .", { cwd: workspace });
    sh(`git commit --message 'chore: Bump version to \`${input.version}\`'`, { cwd: workspace, env: gitEnv });

    if (input.bumpDepsRegExp != undefined) {
      await cargo.bumpDependencies(workspace, input.bumpDepsRegExp, input.bumpDepsVersion, input.bumpDepsBranch);
      sh("git add .", { cwd: workspace});
      sh(`git commit --message 'chore: Bump ${input.bumpDepsRegExp} dependencies to \`${input.bumpDepsVersion}\`'`, {
        cwd: workspace,
        env: gitEnv,
        check: false,
      });

      sh("cargo check", { cwd: workspace});
      sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", {
        cwd: workspace,
        env: gitEnv,
        check: false,
      });
    }

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}