import * as path from "path";

import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import * as cargo from "./cargo";
import * as zip from "./zip";
import * as git from "./git";

const artifact = new DefaultArtifactClient();

export type Input = {
  repo: string;
  version?: string;
  branch?: string;
  target?: string;
  artifactRegExp: RegExp;
  githubToken?: string;
};

export function setup(): Input {
  const repo = core.getInput("repo", { required: true });
  const version = core.getInput("version");
  const branch = core.getInput("branch");
  const target = core.getInput("target");
  const artifactPatterns = core.getInput("artifact-patterns", { required: true });
  const githubToken = core.getInput("github-token");

  return {
    repo,
    version: version == "" ? undefined : version,
    branch: branch == "" ? undefined : branch,
    target: target == "" ? undefined : target,
    artifactRegExp: new RegExp(artifactPatterns.split("\n").join("|")),
    githubToken: githubToken == "" ? undefined : githubToken,
  };
}

export async function main(input: Input) {
  try {
    await cargo.installBinaryCached("cross");

    // NOTE(fuzzypixelz): We clone the repository into the current directory
    // to avoid long paths on Windows, where MSBuild fails on the windows-2019
    // GitHub-hosted runner because it doesn't support paths longer than 260
    // characters.
    const repoName = input.repo.split("/").at(1);
    const repoPath = process.env["GITHUB_ACTIONS"] != undefined ? process.cwd() : repoName;

    git.cloneFromGitHub(input.repo, {
      branch: input.branch,
      token: input.githubToken,
      path: repoPath,
    });

    input.version ??= git.describe(repoPath);
    input.target ??= cargo.hostTarget();

    await cargo.build(repoPath, input.target);

    const output = artifactName(repoName, input.version, input.target);
    await zip.fromDirectory(output, path.join(repoPath, "target", input.target, "release"), input.artifactRegExp);

    const { id } = await artifact.uploadArtifact(output, [output], process.cwd());
    core.setOutput("artifact-id", id);
    core.setOutput("artifact-name", output);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export function artifactName(repo: string, version: string, target: string): string {
  return `${repo}-${version}-${target}-standalone.zip`;
}

export const artifactRegExp: RegExp = /^.*-standalone\.zip$/;
