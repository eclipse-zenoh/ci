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
  toolchain?: string;
  githubToken: string;
  githubUser?: string;
  depsRegExp: RegExp;
  depsGitUrl: string;
  depsBranch: string;
};

export function setup(): Input {
  const version = core.getInput("version", { required: true });
  const releaseBranch = core.getInput("release-branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const toolchain = core.getInput("toolchain");
  const githubToken = core.getInput("github-token", { required: true });
  const githubUser = core.getInput("github-user");
  const depsPattern = core.getInput("deps-pattern");
  const depsGitUrl = core.getInput("deps-git-url");
  const depsBranch = core.getInput("deps-branch");

  return {
    version,
    releaseBranch,
    repo,
    path: path === "" ? undefined : path,
    toolchain: toolchain === "" ? "1.75.0" : toolchain, // Default to 1.75.0 to avoid updating Cargo.lock file version.
    githubToken,
    githubUser: githubUser === "" ? "eclipse-zenoh-bot" : githubUser,
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
    sh(`git switch -c ${input.githubUser}/post-release-${input.version}`, { cwd: repo });
    sh(`ls ${workspace}`);
    // Correct Cargo.lock version to 1.75 toolchain compatible version
    const cargoLockPaths = sh(`find ${workspace} -name "Cargo.lock"`)
      .split("\n")
      .filter(r => r);
    for (const path of cargoLockPaths) {
      cargo.setCargoLockVersion(path);
      if (sh("git diff", { cwd: repo, check: false })) {
        sh("find . -name 'Cargo.lock' | xargs git add", { cwd: repo });
        sh(`git commit --message 'chore: Update Cargo.lock version ${path}'`, { cwd: repo, env: gitEnv });
      }
    }
    // find all Cargo.toml files in the workspace, filtering out the empty string from the array
    const cargoPaths = sh(`find ${workspace} -name "Cargo.toml*"`)
      .split("\n")
      .filter(r => r);

    const pathsToCheck: string[] = [];
    let path: string;
    for (path of cargoPaths) {
      await cargo.setGitBranch(path, input.depsRegExp, input.depsGitUrl, input.depsBranch);
      if (sh("git diff", { cwd: repo, check: false })) {
        sh("find . -name 'Cargo.toml*' | xargs git add", { cwd: repo });
        sh(`git commit --message 'chore: Update git/branch ${path}'`, { cwd: repo, env: gitEnv });
        if (path.endsWith("Cargo.toml")) {
          pathsToCheck.push(path);
        }
      }
    }

    for (path of pathsToCheck) {
      gitEnv["CARGO_NET_GIT_FETCH_WITH_CLI"] = "true";
      gitEnv["CARGO_HTTP_DEBUG"] = "true";
      const p = path.replace(repo, "./");
      sh(`cargo +${input.toolchain} check -vv --manifest-path ${p}`, { cwd: repo, env: gitEnv });
      sh("find . -name 'Cargo.lock' | xargs git add", { cwd: repo });
      sh("git commit --message 'chore: Update Cargo lockfile'", {
        cwd: repo,
        env: gitEnv,
        check: false,
      });
    }
    // Avoid Cargo.lock conflicts by merging the main branch into the post-release branch keeping our changes.
    sh("git fetch origin main && git merge -Xours FETCH_HEAD --no-edit", { cwd: repo, env: gitEnv });

    sh(`git push --force ${remote} ${input.githubUser}/post-release-${input.version}`, { cwd: repo });

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
