import { rm } from "fs/promises";

import * as core from "@actions/core";

import * as estuary from "./estuary";
import * as cargo from "./cargo";
import { sh } from "./command";

export type Input = {
  liveRun: boolean;
  branch: string;
  repos: string[];
  githubToken: string;
  interDepsRegExp: RegExp;
  cratesIoToken?: string;
};

export function setup(): Input {
  const liveRun = core.getInput("live-run");
  const branch = core.getInput("branch", { required: true });
  const repos = core.getInput("repos", { required: true });
  const githubToken = core.getInput("github-token", { required: true });
  const interDepsPattern = core.getInput("inter-deps-pattern", { required: true });
  const cratesIoToken = core.getInput("crates-io-token", { required: true });

  return {
    liveRun: liveRun == "" ? false : core.getBooleanInput("live-run"),
    branch,
    repos: repos.split("\n"),
    githubToken,
    interDepsRegExp: interDepsPattern == "" ? undefined : new RegExp(interDepsPattern),
    cratesIoToken,
  };
}

export async function main(input: Input) {
  let registry: estuary.Estuary;
  try {
    registry = await estuary.spawn();
    for (const repo of input.repos) {
      core.startGroup(`Publishing ${repo} to estuary`);
      clone(repo, input);
      await publishToEstuary(repo, input, registry);
      core.endGroup();
    }

    await deleteRepos(input);

    if (input.liveRun) {
      for (const repo of input.repos) {
        core.startGroup(`Publishing ${repo} to crates.io`);
        clone(repo, input);
        publishToCratesIo(repo, input);
        core.endGroup();
      }
    }

    await cleanup(input, registry);
  } catch (error) {
    await cleanup(input, registry);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export async function cleanup(input: Input, registry: estuary.Estuary) {
  if (!input.liveRun) {
    core.info(`Killing estuary process (${registry.proc.pid})`);
    try {
      process.kill(registry.proc.pid);
    } catch (error) {
      if (error instanceof Error) {
        core.notice(`Could not kill estuary process (${registry.proc.pid}):\n${error.message}`);
      }
    }
  }

  await deleteRepos(input);
}

function clone(repo: string, input: Input): void {
  const remote = `https://${input.githubToken}@github.com/${repo}.git`;
  sh(`git clone --recursive --single-branch --branch ${input.branch} ${remote}`);
}

async function deleteRepos(input: Input) {
  for (const repo of input.repos) {
    core.info(`Deleting repository ${repoPath(repo)}`);
    await rm(repoPath(repo), { recursive: true, force: true });
  }
}

function repoPath(repo: string): string {
  return repo.split("/").at(1);
}

async function publishToEstuary(repo: string, input: Input, registry: estuary.Estuary): Promise<void> {
  const path = repoPath(repo);

  await cargo.configRegistry(path, registry.name, registry.index);
  await cargo.setRegistry(path, input.interDepsRegExp, registry.name);

  const env = {
    CARGO_REGISTRY_DEFAULT: registry.name,
    [`CARGO_REGISTRIES_${registry.name.toUpperCase()}_TOKEN`]: registry.token,
  };

  publish(repo, env);
}

function publishToCratesIo(repo: string, input: Input) {
  const env = {
    CARGO_REGISTRY_TOKEN: input.cratesIoToken,
  };

  publish(repo, env);
}

function publish(repo: string, env: NodeJS.ProcessEnv) {
  const path = repoPath(repo);
  const options = {
    env,
    cwd: path,
    check: true,
  };

  for (const package_ of cargo.packagesOrdered(path)) {
    if (package_.publish == undefined || package_.publish) {
      sh(`cargo publish --manifest-path ${package_.manifestPath}`, options);
    }
  }
  sh("cargo clean", options);
}
