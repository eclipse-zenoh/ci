import * as fs from "fs/promises";
import * as path from "path";

import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";
import * as toml from "smol-toml";

import * as cargo from "./cargo";
import { sh } from "./command";
import * as zip from "./zip";

const artifact = new DefaultArtifactClient();

export type Input = {
  repo: string;
  version: string;
  branch: string;
  target: string;
  artifactRegExp: RegExp;
  githubToken: string;
};

export function setup(): Input {
  const repo = core.getInput("repo", { required: true });
  const version = core.getInput("version", { required: true });
  const branch = core.getInput("branch", { required: true });
  const target = core.getInput("target", { required: true });
  const artifactPatterns = core.getInput("artifact-patterns", { required: true });
  const githubToken = core.getInput("github-token", { required: true });

  return {
    repo,
    version,
    branch,
    target,
    artifactRegExp: new RegExp(artifactPatterns.split("\n").join("|")),
    githubToken,
  };
}

export async function main(input: Input) {
  try {
    await cargo.installBinaryCached("cross");

    const repo = input.repo.split("/")[1];
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    sh(`git clone --recursive --branch ${input.branch} --single-branch ${remote}`);

    const crossContents = await fs.readFile(path.join(repo, "Cross.toml"), "utf-8");
    const crossManifest = toml.parse(crossContents) as CrossManifest;

    sh(`rustup target add ${input.target}`);

    if (input.target in crossManifest.target) {
      sh(`cross build --release --bins --lib --target ${input.target}`, {
        cwd: repo,
      });
    } else {
      sh(`cargo build --release --bins --lib --target ${input.target}`, {
        cwd: repo,
      });
    }

    const output = `${repo}-${input.version}-${input.target}-artifacts`;
    const outputArchive = output.concat(".zip");
    await zip.fromDirectory(outputArchive, path.join(repo, "target", input.target, "release"), input.artifactRegExp);

    const { id } = await artifact.uploadArtifact(output, [outputArchive], process.cwd());
    core.setOutput("artifact-id", id);

    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

type CrossManifest = {
  target: { [target: string]: { image: string } };
};

export async function cleanup(input: Input) {
  const repoPath = input.repo.split("/")[1];
  core.info(`Deleting repository ${repoPath}`);
  await fs.rm(repoPath, { recursive: true, force: true });
}
