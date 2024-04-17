import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";

const DEFAULT_DRY_RUN_HISTORY_SIZE = 30;

export type Input = {
  version?: string;
  liveRun: boolean;
  dryRunHistorySize?: number;
  repo: string;
  githubToken: string;
};

export function setup(): Input {
  const version = core.getInput("version");
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const repo = core.getInput("repo", { required: true });
  const githubToken = core.getInput("github-token", { required: true });
  const dryRunHistorySize = core.getInput("dry-run-history-size");

  return {
    version: version === "" ? undefined : version,
    liveRun,
    repo,
    githubToken,
    dryRunHistorySize: dryRunHistorySize == "" ? DEFAULT_DRY_RUN_HISTORY_SIZE : Number(dryRunHistorySize),
  };
}

export async function main(input: Input) {
  try {
    const repo = input.repo.split("/")[1];
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;

    sh(`git clone --recursive ${remote}`);

    const version = input.version ?? sh("git describe", { cwd: repo }).trimEnd();
    core.setOutput("version", version);

    let branch: string;
    if (input.liveRun) {
      branch = `release/${version}`;
      core.setOutput("branch", branch);
    } else {
      branch = `release/dry-run/${version}`;
      core.setOutput("branch", branch);

      const refsPattern = "refs/remotes/origin/release/dry-run";
      const refsRaw = sh(`git for-each-ref --format='%(refname)' --sort=authordate ${refsPattern}`, { cwd: repo });
      const refs = refsRaw.split("\n");

      if (refs.length >= input.dryRunHistorySize) {
        sh(`git push origin --delete ${refs.at(0)}`, { cwd: repo });
      }
    }

    sh(`git switch --force-create ${branch}`, { cwd: repo });
    sh(`git push --force ${remote} ${branch}`, { cwd: repo });

    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export async function cleanup(input: Input) {
  const repo = input.repo.split("/")[1];
  core.info(`Deleting repository ${repo}`);
  await rm(repo, { recursive: true, force: true });
}
