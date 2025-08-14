import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";
import { gitEnv } from "./config";

export type Input = {
  version: string;
  liveRun: boolean;
  branch: string;
  repo: string;
  path?: string;
  toolchain?: string;
  githubToken: string;
  bumpDepsPattern?: RegExp[];
  bumpDepsVersion?: string[];
  bumpDepsBranch?: string;
};

export function setup(): Input {
  const version = core.getInput("version", { required: true });
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const branch = core.getInput("branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const toolchain = core.getInput("toolchain");
  const githubToken = core.getInput("github-token", { required: true });
  const bumpDepsBranch = core.getInput("bump-deps-branch");
  const bumpDepsPatternRaw = core.getMultilineInput("bump-deps-pattern");
  const bumpDepsVersionRaw = core.getMultilineInput("bump-deps-version");
  // Parse multiline inputs if provided
  let bumpDepsPattern: RegExp[] | undefined = undefined;
  let bumpDepsVersion: string[] | undefined = undefined;

  if (
    (bumpDepsPatternRaw.length > 0 && bumpDepsVersionRaw.length === 0) ||
    (bumpDepsPatternRaw.length === 0 && bumpDepsVersionRaw.length > 0)
  ) {
    throw new Error(
      "Both bump-deps-pattern and bump-deps-version must be provided together (either both empty or both non-empty).",
    );
  }
  if (bumpDepsPatternRaw.length > 0 && bumpDepsVersionRaw.length > 0) {
    if (bumpDepsPatternRaw.length !== bumpDepsVersionRaw.length) {
      throw new Error(`bump-deps-pattern and bump-deps-version must have the same number of lines`);
    }
    bumpDepsPattern = bumpDepsPatternRaw.map(pat => new RegExp(pat));
    bumpDepsVersion = bumpDepsVersionRaw;
  }

  return {
    version,
    liveRun,
    branch,
    repo,
    path: path === "" ? undefined : path,
    toolchain: toolchain === "" ? "1.75.0" : toolchain, // Default to 1.75.0 to avoid updating Cargo.lock file version.
    githubToken,
    bumpDepsPattern,
    bumpDepsVersion,
    bumpDepsBranch: bumpDepsBranch === "" ? undefined : bumpDepsBranch,
  };
}

export async function main(input: Input) {
  try {
    const repo = input.repo.split("/")[1];
    const workspace = input.path === undefined ? repo : join(repo, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;

    sh(`git clone --recursive --single-branch --branch ${input.branch} ${remote}`);
    sh(`ls ${workspace}`);

    await cargo.bump(workspace, input.version);
    sh("git add .", { cwd: repo });
    sh(`git commit --message 'chore: Bump version to \`${input.version}\`'`, { cwd: repo, env: gitEnv });

    if (
      input.bumpDepsPattern &&
      input.bumpDepsVersion &&
      input.bumpDepsPattern.length === input.bumpDepsVersion.length
    ) {
      for (let i = 0; i < input.bumpDepsPattern.length; i++) {
        await cargo.bumpDependencies(
          workspace,
          input.bumpDepsPattern[i],
          input.bumpDepsVersion[i],
          input.bumpDepsBranch,
        );
        sh("git add .", { cwd: repo });
        sh(
          `git commit --message 'chore: Bump ${input.bumpDepsPattern[i].source} dependencies to \`${input.bumpDepsVersion[i]}\`'`,
          { cwd: repo, env: gitEnv, check: false },
        );
      }

      sh(`cargo +${input.toolchain} check`, { cwd: repo });
      sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", {
        cwd: repo,
        env: gitEnv,
        check: false,
      });
    }

    sh(`git push --force ${remote} ${input.branch}`, { cwd: repo });

    if (input.liveRun) {
      sh(`git tag --force ${input.version} --message v${input.version}`, { cwd: repo, env: gitEnv });
      sh(`git push --force ${remote} ${input.version}`, { cwd: repo });
    }

    sh("git log -10", { cwd: repo });
    sh("git show-ref --tags", { cwd: repo });

    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export async function cleanup(input: Input) {
  const repo = input.repo.split("/")[1];
  core.info(`Deleting repository clone ${repo}`);
  await rm(repo, { recursive: true, force: true });
}
