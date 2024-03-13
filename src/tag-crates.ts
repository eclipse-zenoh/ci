import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { sh } from "./command";
import * as cargo from "./cargo";

const DEFAULT_DRY_RUN_HISTORY_SIZE = 30;

export type Input = {
  version?: string;
  liveRun: boolean;
  dryRunHistorySize?: number;
  repo: string;
  path?: string;
  githubToken: string;
  actorEnv: NodeJS.ProcessEnv;
  interDepsRegExp: RegExp;
  interDepsVersion?: string;
};

export function setup(): Input {
  const version = core.getInput("version");
  const liveRun = core.getInput("live-run");
  const dryRunHistorySize = core.getInput("dry-run-history-size");
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const githubToken = core.getInput("github-token", { required: true });
  const actorName = core.getInput("actor-name", { required: true });
  const actorEmail = core.getInput("actor-email", { required: true });
  const interDepsPattern = core.getInput("inter-deps-pattern", { required: true });
  const interDepsVersion = core.getInput("inter-deps-version");

  return {
    version: version == "" ? undefined : version,
    liveRun: liveRun == "" ? false : core.getBooleanInput("live-run"),
    dryRunHistorySize: dryRunHistorySize == "" ? undefined : Number(dryRunHistorySize),
    repo,
    path: path == "" ? undefined : path,
    githubToken,
    actorEnv: {
      GIT_AUTHOR_NAME: actorName,
      GIT_AUTHOR_EMAIL: actorEmail,
      GIT_COMMITTER_NAME: actorName,
      GIT_COMMITTER_EMAIL: actorEmail,
    },
    interDepsRegExp: new RegExp(interDepsPattern),
    interDepsVersion: interDepsVersion == "" ? undefined : interDepsVersion,
  };
}

export async function main(input: Input) {
  try {
    const repo = input.repo.split("/")[1];
    const workspace = input.path == undefined ? repo : join(repo, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;

    sh(`git clone --recursive ${remote}`);
    sh(`ls ${workspace}`);

    input.dryRunHistorySize ??= DEFAULT_DRY_RUN_HISTORY_SIZE;
    input.version ??= sh(`git describe`, { cwd: repo }).trimEnd();
    core.setOutput("version", input.version);

    let branch: string;
    if (input.liveRun) {
      branch = `release/${input.version}`;
      core.setOutput("branch", branch);
    } else {
      branch = `release/dry-run/${input.version}`;
      core.setOutput("branch", branch);

      const refsPattern = "refs/remotes/origin/release/dry-run";
      const refsRaw = sh(`git for-each-ref --format='%(refname)' --sort=authordate ${refsPattern}`, { cwd: repo });
      const refs = refsRaw.split("\n");

      if (refs.includes(`refs/remotes/origin/${branch}`)) {
        core.info(`Version ${input.version} has already been tagged`);
        await cleanup(input);
        return;
      }

      if (refs.length >= input.dryRunHistorySize) {
        sh(`git push origin --delete ${refs.at(0)}`, { cwd: repo });
      }
    }

    input.interDepsVersion ??= input.version;
    sh(`git switch --create ${branch}`, { cwd: repo });

    await cargo.bump(workspace, input.version);
    sh(`git add . `, { cwd: repo });
    sh(`git commit --message 'chore: Bump version to \`${input.version}\`'`, { cwd: repo, env: input.actorEnv });

    await cargo.bumpDependencies(workspace, input.interDepsRegExp, input.interDepsVersion);
    sh(`git add . `, { cwd: repo });
    sh(`git commit --message 'chore: Point inter-dependencies to \`${input.interDepsVersion}\`'`, {
      cwd: repo,
      env: input.actorEnv,
      check: false,
    });

    sh(`cargo check`, { cwd: repo });
    sh("git commit Cargo.lock --message 'chore: Update Cargo lockfile'", {
      cwd: repo,
      env: input.actorEnv,
      check: false,
    });

    sh(`git tag ${input.version} --message v${input.version}`, { cwd: repo, env: input.actorEnv });
    sh(`git log -10`, { cwd: repo });
    sh(`git show-ref --tags`, { cwd: repo });
    sh(`git push ${remote} ${branch} ${input.version}`, { cwd: repo });

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
