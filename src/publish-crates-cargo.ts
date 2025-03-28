import { rm } from "fs/promises";

import * as core from "@actions/core";

import * as cargo from "./cargo";
import { sh } from "./command";

export type Input = {
  liveRun: boolean;
  branch: string;
  repo: string;
  submodulePath?: string;
  githubToken: string;
  unpublishedDepsRegExp: RegExp;
  unpublishedDepsRepos: string[];
  cratesIoToken?: string;
  artifactoryToken?: string;
  artifactoryIndex?: string;
  publicationTest: boolean;
};

export function setup(): Input {
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const branch = core.getInput("branch", { required: true });
  const repo = core.getInput("repo", { required: true });
  const submodulePath = core.getInput("submodule-path");
  const githubToken = core.getInput("github-token", { required: true });
  const cratesIoToken = core.getInput("crates-io-token");
  const artifactoryToken = core.getInput("artifactory-token");
  const artifactoryIndex = core.getInput("artifactory-index");
  const unpublishedDepsPatterns = core.getInput("unpublished-deps-patterns");
  const unpublishedDepsRepos = core.getInput("unpublished-deps-repos");
  const publicationTest = core.getBooleanInput("publication-test");

  return {
    liveRun,
    branch,
    repo,
    submodulePath,
    githubToken,
    unpublishedDepsRegExp:
      unpublishedDepsPatterns === "" ? /^$/ : new RegExp(unpublishedDepsPatterns.split("\n").join("|")),
    unpublishedDepsRepos: unpublishedDepsRepos === "" ? [] : unpublishedDepsRepos.split("\n"),
    cratesIoToken,
    artifactoryToken,
    artifactoryIndex,
    publicationTest,
  };
}

export async function main(input: Input) {
  try {
    if (input.publicationTest) {
      core.info("Running cargo check before publication");
      clone(input, input.repo, input.branch);
      const path = getPath(input);
      core.info(`Got path: ${path}`);
      const options = {
        cwd: path,
        check: true,
      };

      for (const package_ of cargo.packagesOrdered(path)) {
        const command = ["cargo", "check", "-p", package_.name, "--manifest-path", package_.manifestPath];
        sh(command.join(" "), options);
      }

      await deleteRepos(input);
    }

    if (input.liveRun) {
      let publishFn: (input: Input, repo: string, branch?: string) => void;
      if (input.artifactoryToken) {
        publishFn = publishToArtifactory;
      } else if (input.cratesIoToken) {
        publishFn = publishToCratesIo;
      } else {
        throw new Error("No token provided for publication");
      }

      for (const repo of input.unpublishedDepsRepos) {
        publishFn(input, repo);
      }

      publishFn(input, input.repo, input.branch);
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

function clone(input: Input, repo: string, branch?: string): void {
  const remote = `https://${input.githubToken}@github.com/${repo}.git`;

  if (branch === undefined) {
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

function getPath(input: Input): string {
  let path: string;
  path = repoPath(input.repo);
  if (input.submodulePath) {
    path = repoPath(input.repo) + "/" + input.submodulePath;
  }
  return path;
}

function publishToArtifactory(input: Input, repo: string, branch?: string) {
  core.info("Publishing to Artifactory");
  clone(input, repo, branch);
  const path = getPath(input);
  core.info(`Got path: ${path}`);

  const env = {
    CARGO_REGISTRIES_ARTIFACTORY_TOKEN: input.artifactoryToken,
    CARGO_REGISTRIES_ARTIFACTORY_INDEX: input.artifactoryIndex,
    CARGO_REGISTRY_DEFAULT: "artifactory",
  };

  publish(path, env);
}

function publishToCratesIo(input: Input, repo: string, branch?: string) {
  core.info("Publishing to CratesIo");
  clone(input, repo, branch);
  const path = repoPath(repo);

  const env = {
    CARGO_REGISTRY_TOKEN: input.cratesIoToken,
  };

  publish(path, env);
}

function publish(path: string, env: NodeJS.ProcessEnv, allowDirty: boolean = false) {
  const options = {
    env,
    cwd: path,
    check: true,
  };

  for (const package_ of cargo.packagesOrdered(path)) {
    // Crates.io won't allow packages to be published with the same version
    if (!cargo.isPublished(package_, options) && (package_.publish === undefined || package_.publish)) {
      const command = ["cargo", "publish", "--locked", "--manifest-path", package_.manifestPath];
      if (allowDirty) {
        command.push("--allow-dirty");
      }
      sh(command.join(" "), options);
    }
  }

  sh("cargo clean", options);
}
