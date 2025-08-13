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
  bumpDepsPatterns?: RegExp[];
  bumpDepsVersions?: string[];
  bumpDepsRegExp?: RegExp;
  bumpDepsVersion: string;
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
  const bumpDepsPattern = core.getInput("bump-deps-pattern");
  const bumpDepsVersion = core.getInput("bump-deps-version");
  const bumpDepsBranch = core.getInput("bump-deps-branch");
  const bumpDepsPatternsRaw = core.getMultilineInput("bump-deps-patterns");
  const bumpDepsVersionsRaw = core.getMultilineInput("bump-deps-versions");
  // Parse multiline inputs if provided
  let bumpDepsPatterns: RegExp[] | undefined = undefined;
  let bumpDepsVersions: string[] | undefined = undefined;

  if (bumpDepsPatternsRaw.length > 0 && bumpDepsVersionsRaw.length > 0) {
    if (bumpDepsPatternsRaw.length !== bumpDepsVersionsRaw.length) {
      throw new Error(`bump-deps-patterns and bump-deps-versions must have the same number of lines`);
    }
    bumpDepsPatterns = bumpDepsPatternsRaw.map(pat => new RegExp(pat));
    bumpDepsVersions = bumpDepsVersionsRaw;
  }

  return {
    version,
    liveRun,
    branch,
    repo,
    path: path === "" ? undefined : path,
    toolchain: toolchain === "" ? "1.75.0" : toolchain, // Default to 1.75.0 to avoid updating Cargo.lock file version.
    githubToken,
    bumpDepsRegExp: bumpDepsPattern === "" ? undefined : new RegExp(bumpDepsPattern),
    bumpDepsVersion: bumpDepsVersion === "" ? version : bumpDepsVersion,
    bumpDepsBranch: bumpDepsBranch === "" ? undefined : bumpDepsBranch,
    bumpDepsPatterns,
    bumpDepsVersions,
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
      input.bumpDepsPatterns &&
      input.bumpDepsVersions &&
      input.bumpDepsPatterns.length === input.bumpDepsVersions.length
    ) {
      for (let i = 0; i < input.bumpDepsPatterns.length; i++) {
        await cargo.bumpDependencies(
          workspace,
          input.bumpDepsPatterns[i],
          input.bumpDepsVersions[i],
          input.bumpDepsBranch,
        );
        sh("git add .", { cwd: repo });
        sh(
          `git commit --message 'chore: Bump ${input.bumpDepsPatterns[i].source} dependencies to \`${input.bumpDepsVersions[i]}\`'`,
          { cwd: repo, env: gitEnv, check: false },
        );
      }
    } else if (input.bumpDepsRegExp != undefined) {
      // keep current behavior for backwards compatibility
      await cargo.bumpDependencies(workspace, input.bumpDepsRegExp, input.bumpDepsVersion, input.bumpDepsBranch);
      sh("git add .", { cwd: repo });
      sh(`git commit --message 'chore: Bump ${input.bumpDepsRegExp} dependencies to \`${input.bumpDepsVersion}\`'`, {
        cwd: repo,
        env: gitEnv,
        check: false,
      });
    }

    sh(`cargo +${input.toolchain} check`, { cwd: repo });
    sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", {
      cwd: repo,
      env: gitEnv,
      check: false,
    });

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
