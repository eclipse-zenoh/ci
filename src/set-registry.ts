import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";
import { gitEnv } from "./config";

export type Input = {
  version: string;
  tag: string;
  liveRun: boolean;
  registry: string;
  registryIndex: string;
  releaseBranch: string;
  repo: string;
  path?: string;
  toolchain?: string;
  githubToken: string;
  depsRegExp: RegExp;
};

export function setup(): Input {
  const version = core.getInput("version", { required: true });
  const tag = core.getInput("tag");
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const registry = core.getInput("registry", { required: true });
  const registryIndex = core.getInput("registry-index", { required: true });
  const releaseBranch = core.getInput("release-branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const toolchain = core.getInput("toolchain");
  const githubToken = core.getInput("github-token", { required: true });
  const depsPattern = core.getInput("deps-pattern");

  return {
    version,
    tag,
    liveRun,
    registry,
    registryIndex,
    releaseBranch,
    repo,
    path: path === "" ? undefined : path,
    toolchain: toolchain === "" ? "1.75.0" : toolchain, // Default to 1.75.0 to avoid updating Cargo.lock file version.
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

    await cargo.configRegistry(workspace, input.registry, input.registryIndex);
    if (sh("git diff", { cwd: repo, check: false })) {
      sh("git add .cargo/config.toml", { cwd: repo });
      sh(`git commit --message 'chore: add ${input.registry} to .cargo/config.toml'`, { cwd: repo, env: gitEnv });
    }

    await cargo.setRegistry(workspace, input.depsRegExp, input.registry);
    if (sh("git diff", { cwd: repo, check: false })) {
      sh("find . -name 'Cargo.toml*' | xargs git add", { cwd: repo });
      sh(`git commit --message 'chore: Update Cargo.toml to use ${input.registry}'`, { cwd: repo, env: gitEnv });

      sh(`cargo +${input.toolchain} check`, { cwd: repo });
      sh("find . -name 'Cargo.lock' | xargs git add", { cwd: repo });
      sh("git commit --message 'chore: Update Cargo lockfile'", {
        cwd: repo,
        env: gitEnv,
        check: false,
      });
    }

    sh(`git push --force ${remote} ${input.releaseBranch}`, { cwd: repo });

    if (input.liveRun) {
      const tag = input.tag === "" ? input.version : input.tag;
      sh(`git tag --force ${tag} --message v${tag}`, { cwd: repo, env: gitEnv });
      sh(`git push --force ${remote} ${tag}`, { cwd: repo });
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
