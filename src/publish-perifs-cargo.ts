import { rm } from "fs/promises";

import * as core from "@actions/core";

import * as estuary from "./estuary";
import * as cargo from "./cargo";
import { run } from "./run";

export type Input = {
  dryRun: boolean;
  branch: string;
  repos: string[];
  githubToken: string;
  actorEnv: NodeJS.ProcessEnv;
  interDepsRegExp: RegExp;
};

export function setup(): Input {
  const dryRun = core.getBooleanInput("dry-run", { required: true });
  const branch = core.getInput("branch", { required: true });
  const repos = core.getInput("repos", { required: true });
  const githubToken = core.getInput("github-token", { required: true });
  const actorName = core.getInput("actor-name", { required: true });
  const actorEmail = core.getInput("actor-email", { required: true });
  const interDepsPattern = core.getInput("inter-deps-pattern");

  return {
    dryRun,
    branch,
    repos: repos.split("\n"),
    githubToken,
    actorEnv: {
      GIT_AUTHOR_NAME: actorName,
      GIT_AUTHOR_EMAIL: actorEmail,
      GIT_COMMITTER_NAME: actorName,
      GIT_COMMITTER_EMAIL: actorEmail,
    },
    interDepsRegExp: interDepsPattern == "" ? undefined : new RegExp(interDepsPattern),
  };
}

export async function main(input: Input) {
  try {
    if (input.dryRun) {
      const registry = await estuary.spawn();
      core.saveState("estuary-pid", registry.proc.pid);
      for (const repo of input.repos) {
        core.startGroup(`Publishing ${repo} to estuary`);
        clone(repo, input);
        await publishToEstuary(repo, registry, input);
        push(repo, input);
        core.endGroup();
      }
    } else {
      for (const repo of input.repos) {
        core.startGroup(`Publishing ${repo} to crates.io`);
        clone(repo, input);
        publishToCratesIo(repo);
        core.endGroup();
      }
    }
    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export async function cleanup(input: Input) {
  if (input.dryRun) {
    process.kill(Number(core.getState("estuary-pid")));
  }

  await deleteRepos(input);
}

function clone(repo: string, input: Input): void {
  const repoRemote = remoteOf(repo, input);
  const repoPath = pathOf(repo);
  core.info(`Cloning ${repoRemote} into ${repoPath}`);
  run("git", [
    "clone",
    "--recursive",
    "--branch",
    input.branch,
    "--single-branch",
    repoRemote,
    repoPath,
  ]);
}

function push(repo: string, input: Input): void {
  const repoPath = pathOf(repo);
  core.info(`Pushing ${input.branch} to ${repo}`);
  run("git", ["push", remoteOf(repo, input), input.branch], { cwd: repoPath });
}

async function deleteRepos(input: Input) {
  for (const repo of input.repos) {
    const repoPath = pathOf(repo);
    core.info(`Deleting repository ${repoPath}`);
    await rm(pathOf(repo), { recursive: true, force: true });
  }
}

function remoteOf(repo: string, input: Input): string {
  return `https://${input.githubToken}@github.com/${repo}.git`;
}

function pathOf(repo: string): string {
  return repo.split("/").at(1);
}

async function publishToEstuary(
  repo: string,
  registry: estuary.Estuary,
  input: Input,
): Promise<void> {
  const repoPath = pathOf(repo);

  await cargo.configRegistry(repoPath, registry.name, registry.index);
  run("git", ["add", `.cargo/config.toml`], { cwd: repoPath });
  run("git", ["commit", "-m", "chore: Configure estuary Cargo registry"], {
    env: input.actorEnv,
    cwd: repoPath,
  });

  await cargo.setRegistry(repoPath, input.interDepsRegExp, registry.name);
  run("git", ["add", `Cargo.toml`], { cwd: repoPath });
  run("git", ["commit", "-m", "chore: Set inter-dependencies' Cargo registry to estuary"], {
    env: input.actorEnv,
    cwd: repoPath,
  });

  const env = {
    CARGO_REGISTRY_DEFAULT: registry.name,
    [`CARGO_REGISTRIES_${registry.name.toUpperCase()}_TOKEN`]: registry.token,
  };

  publish(repo, env);
}

function publishToCratesIo(repo: string) {
  const env = {
    CARGO_REGISTRY_TOKEN: core.getInput("crates-io-token"),
  };

  publish(repo, env);
}

function publish(repo: string, env: NodeJS.ProcessEnv) {
  const repoPath = pathOf(repo);
  const options = {
    env,
    cwd: pathOf(repo),
    check: true,
  };

  for (const package_ of cargo.packagesOrdered(repoPath)) {
    if (package_.publish == undefined || package_.publish) {
      run("cargo", ["publish", "--manifest-path", package_.manifestPath], options);
    }
  }
  run("cargo", ["clean"], options);
}
