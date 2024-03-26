import { rm } from "fs/promises";

import * as core from "@actions/core";

import * as estuary from "./estuary";
import * as cargo from "./cargo";
import { sh } from "./command";

export type Input = {
  liveRun: boolean;
  branch: string;
  repo: string;
  githubToken: string;
  unpublishedDepsRegExp: RegExp;
  unpublishedDepsRepos: string[];
  cratesIoToken?: string;
};

export function setup(): Input {
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const branch = core.getInput("branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const githubToken = core.getInput("github-token", { required: true });
  const cratesIoToken = core.getInput("crates-io-token", { required: true });
  const unpublishedDepsPatterns = core.getInput("unpublished-deps-patterns");
  const unpublishedDepsRepos = core.getInput("unpublished-deps-repos");

  return {
    liveRun,
    branch,
    repo,
    githubToken,
    unpublishedDepsRegExp:
      unpublishedDepsPatterns == "" ? /^$/ : new RegExp(unpublishedDepsPatterns.split("\n").join("|")),
    unpublishedDepsRepos: unpublishedDepsRepos == "" ? [] : unpublishedDepsRepos.split("\n"),
    cratesIoToken,
  };
}

export async function main(input: Input) {
  let registry: estuary.Estuary;
  try {
    registry = await estuary.spawn();

    for (const repo of input.unpublishedDepsRepos) {
      await publishToEstuary(input, repo, registry, input.unpublishedDepsRegExp);
    }

    await publishToEstuary(input, input.repo, registry, input.unpublishedDepsRegExp, input.branch);

    await deleteRepos(input);

    if (input.liveRun) {
      for (const repo of input.unpublishedDepsRepos) {
        publishToCratesIo(input, repo);
      }

      publishToCratesIo(input, input.repo, input.branch);
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

function clone(input: Input, repo: string, branch?: string): void {
  const remote = `https://${input.githubToken}@github.com/${repo}.git`;

  if (branch == undefined) {
    sh(`git clone --recursive ${remote}`);
  } else {
    sh(`git clone --recursive --single-branch --branch ${branch} ${remote}`);
  }
}

async function deleteRepos(input: Input) {
  core.info(`Deleting repository clone ${repoPath(input.repo)}`);
  await rm(repoPath(input.repo), { recursive: true, force: true });

  for (const repo of input.unpublishedDepsRepos) {
    core.info(`Deleting repository clone ${repoPath(repo)}`);
    await rm(repoPath(repo), { recursive: true, force: true });
  }
}

function repoPath(repo: string): string {
  return repo.split("/").at(1);
}

async function publishToEstuary(
  input: Input,
  repo: string,
  registry: estuary.Estuary,
  registryDepsRegExp: RegExp,
  branch?: string,
): Promise<void> {
  clone(input, repo, branch);
  const path = repoPath(repo);

  await cargo.configRegistry(path, registry.name, registry.index);
  await cargo.setRegistry(path, registryDepsRegExp, registry.name);

  const env = {
    CARGO_REGISTRY_DEFAULT: registry.name,
    [`CARGO_REGISTRIES_${registry.name.toUpperCase()}_TOKEN`]: registry.token,
  };

  publish(path, env);
}

function publishToCratesIo(input: Input, repo: string, branch?: string) {
  clone(input, repo, branch);
  const path = repoPath(repo);

  const env = {
    CARGO_REGISTRY_TOKEN: input.cratesIoToken,
  };

  publish(path, env);
}

function publish(path: string, env: NodeJS.ProcessEnv) {
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
