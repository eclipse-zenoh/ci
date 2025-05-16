import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";
import { gitEnv } from "./config";

export type Input = {
  version: string;
  registry: string;
  releaseBranch: string;
  repo: string;
  path?: string;
  githubToken: string;
  depsRegExp: RegExp;
};

export function setup(): Input {
  const version = core.getInput("version", { required: true });
  const registry = core.getInput("registry", { required: true });
  const releaseBranch = core.getInput("release-branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const githubToken = core.getInput("github-token", { required: true });
  const depsPattern = core.getInput("deps-pattern");

  return {
    version,
    registry,
    releaseBranch,
    repo,
    path: path === "" ? undefined : path,
    githubToken,
    depsRegExp: depsPattern === "" ? new RegExp("$^") : new RegExp(depsPattern),
  };
}

export async function main(input: Input) {
  try {
    const repo = input.repo.split("/")[1];
    const workspace = input.path === undefined ? repo : join(repo, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;

    sh(`git clone --recursive --single-branch --branch ${input.releaseBranch} ${remote}`);
    sh(`ls ${workspace}`);

    await cargo.setRegistry(workspace, input.depsRegExp, input.registry);
    if (sh("git diff", { cwd: repo, check: false })) {
      sh("find . -name 'Cargo.toml*' | xargs git add", { cwd: repo });
      sh(`git commit --message 'chore: Update Cargo.toml to use ${input.registry}'`, { cwd: repo, env: gitEnv });

      sh(`cargo check`, { cwd: repo });
      sh("find . -name 'Cargo.lock' | xargs git add", { cwd: repo });
      sh("git commit --message 'chore: Update Cargo lockfile'", {
          cwd: repo,
          env: gitEnv,
          check: false,
        });
      }

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
