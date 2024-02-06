import { join } from "path";
import { rm } from "fs/promises";

import * as core from "@actions/core";

import { run } from "./run";
import * as cargo from "./cargo";

const DEFAULT_DRY_RUN_HISTORY_SIZE = 30;

export type Input = {
  version?: string;
  dryRun: boolean;
  dryRunHistorySize?: number;
  repo: string;
  path?: string;
  githubToken: string;
  actorEnv: NodeJS.ProcessEnv;
  interDepsRegExp: RegExp;
  interDepsVersion?: string;
  interDepsGit?: string;
  interDepsBranch?: string;
};

export function setup(): Input {
  const version = core.getInput("version");
  const dryRun = core.getBooleanInput("dry-run", { required: true });
  const dryRunHistorySize = core.getInput("dry-run-history-size");
  const repo = core.getInput("repo", { required: true });
  const path = core.getInput("path");
  const githubToken = core.getInput("github-token", { required: true });
  const actorName = core.getInput("actor-name", { required: true });
  const actorEmail = core.getInput("actor-email", { required: true });
  const interDepsPattern = core.getInput("inter-deps-pattern", { required: true });
  const interDepsVersion = core.getInput("inter-deps-version");
  const interDepsGit = core.getInput("inter-deps-git");
  const interDepsBranch = core.getInput("inter-deps-branch");

  return {
    version,
    dryRun,
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
    interDepsGit: interDepsGit == "" ? undefined : interDepsGit,
    interDepsBranch: interDepsBranch == "" ? undefined : interDepsBranch,
  };
}

export async function main(input: Input) {
  try {
    const repoPath = input.repo.split("/")[1];
    const workspacePath = input.path == undefined ? repoPath : join(repoPath, input.path);
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;

    run("git", ["clone", "--recursive", remote, repoPath]);

    run("ls", [workspacePath]);

    input.dryRunHistorySize ??= DEFAULT_DRY_RUN_HISTORY_SIZE;

    let version: string;
    let branch: string;
    if (input.dryRun) {
      version = run("git", ["describe"], { cwd: repoPath }).trimEnd();
      branch = `release/dry-run/${version}`;
      core.setOutput("branch", branch);

      const refs = run(
        "git",
        [
          "for-each-ref",
          "--format=%(refname)",
          "--sort=authordate",
          "refs/remotes/origin/release/dry-run",
        ],
        {
          cwd: repoPath,
        },
      ).split("\n");

      if (refs.includes(`refs/remotes/origin/${branch}`)) {
        core.info(`Version ${version} has already been tagged`);
        return;
      }

      if (refs.length >= input.dryRunHistorySize) {
        run("git", ["push", "origin", "--delete", refs.at(0)], { cwd: repoPath });
      }
    } else {
      version = input.version!;
      branch = `release/${version}`;
      core.setOutput("branch", branch);
    }

    run("git", ["switch", "--create", branch], { cwd: repoPath });

    await cargo.bump(workspacePath, version);
    run("git", ["add", "."], { cwd: repoPath });
    run("git", ["commit", "-m", `chore: Bump version to \`${version}\``], {
      cwd: repoPath,
      env: input.actorEnv,
    });

    input.interDepsVersion ??= version;

    await cargo.bumpDependencies(
      workspacePath,
      input.interDepsRegExp,
      input.interDepsVersion,
      input.interDepsGit,
      input.interDepsBranch,
    );
    run("git", ["add", "."], { cwd: repoPath });
    run(
      "git",
      ["commit", "-m", `chore: Point inter-dependencies to \`${input.interDepsVersion}\``],
      {
        cwd: repoPath,
        env: input.actorEnv,
      },
    );

    await cargo.bumpDebianDependencies(
      workspacePath,
      input.interDepsRegExp,
      input.interDepsVersion,
    );
    run("git", ["add", "."], { cwd: repoPath });
    run(
      "git",
      ["commit", "-m", `chore: Point Debian inter-dependencies to \`${input.interDepsVersion}\``],
      {
        cwd: repoPath,
        env: input.actorEnv,
      },
    );

    run("git", ["tag", version, "-m", `v${version}`], {
      cwd: repoPath,
      env: input.actorEnv,
    });
    run("git", ["log", "-5"], { cwd: repoPath });
    run("git", ["show-ref", "--tags"], { cwd: repoPath });
    run("git", ["push", remote, branch, version], { cwd: repoPath });

    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export async function cleanup(input: Input) {
  const repoPath = input.repo.split("/")[1];
  await rm(repoPath, { recursive: true, force: true });
}
