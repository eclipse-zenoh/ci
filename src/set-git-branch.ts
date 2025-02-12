import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";
import { gitEnv } from "./config";

export type Input = {
  version: string;
  releaseBranch: string;
  repo: string;
  path?: string;
  githubToken: string;
  depsRegExp: RegExp;
  depsGitUrl: string;
  depsBranch: string;
};

export function setup(): Input {
  const version = core.getInput("version", { required: true });
  const releaseBranch = core.getInput("release-branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const githubToken = core.getInput("github-token", { required: true });
  const depsPattern = core.getInput("deps-pattern");
  const depsGitUrl = core.getInput("deps-git-url");
  const depsBranch = core.getInput("deps-branch");

  return {
    version,
    releaseBranch,
    repo,
    path: path === "" ? undefined : path,
    githubToken,
    depsRegExp: depsPattern === "" ? undefined : new RegExp(depsPattern),
    depsGitUrl: depsGitUrl === "" ? undefined : depsGitUrl,
    depsBranch: depsBranch === "" ? undefined : depsBranch,
  };
}

export async function main(input: Input) {
  try {
    const repo = input.repo.split("/")[1];
    const workspace = input.path === undefined ? repo : join(repo, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;

    sh(`git clone --recursive --single-branch --branch ${input.releaseBranch} ${remote}`);
    sh(`ls ${workspace}`);
    // find all Cargo.toml files in the workspace
    const cargoPaths = sh(`find ${workspace} -name Cargo.toml -exec dirname {} \\;`).split("\n")

    for (const path of cargoPaths) {
      await cargo.setGitBranch(path, input.depsRegExp, input.depsGitUrl, input.depsBranch);
      sh("git add .", { cwd: repo });
      sh(`git commit --message 'chore: Update git/branch'`, { cwd: repo, env: gitEnv });

      sh(`cargo check --manifest-path ${path}`, { cwd: repo });
      sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", {
        cwd: repo,
        env: gitEnv,
        check: false,
      });
    }

    sh(`git push --force ${remote} HEAD:eclipse-zenoh-bot/post-release-${input.version}`, { cwd: repo });

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
