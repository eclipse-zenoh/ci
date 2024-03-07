import { rm } from "fs/promises";

import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import * as cargo from "./cargo";
import { sh } from "./command";
import * as zip from "./zip";
import path from "path";

const artifact = new DefaultArtifactClient();

export type Input = {
  repo: string;
  version: string;
  branch: string;
  target: string;
  githubToken: string;
};

export function setup(): Input {
  const repo = core.getInput("repo", { required: true });
  const version = core.getInput("version", { required: true });
  const branch = core.getInput("branch", { required: true });
  const target = core.getInput("target", { required: true });
  const githubToken = core.getInput("github-token", { required: true });

  return {
    repo,
    version,
    branch,
    target,
    githubToken,
  };
}

export async function main(input: Input) {
  try {
    await cargo.installBinaryCached("cargo-deb");
    await cargo.installBinaryCached("cross");

    const repo = input.repo.split("/")[1];
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    sh(`git clone --recursive --branch ${input.branch} --single-branch ${remote}`);

    sh(`rustup target add ${input.target}`, { cwd: repo });

    sh(`cross build --release --bins --lib --target ${input.target}`, {
      cwd: repo,
    });

    const packages = await cargo.packagesDebian(repo);
    core.info(`Building ${packages.map(p => p.name).join(", ")}`);

    for (const package_ of packages) {
      sh(
        `cargo deb --no-build --no-strip \
        --target ${input.target} \
        --package ${package_.name} \
        --deb-version ${input.version}`,
        {
          cwd: repo,
        },
      );
    }

    const output = artifactName(repo, input.version, input.target);
    await zip.fromDirectory(output, path.join(repo, "target", input.target, "debian"), /.*deb/);

    const { id } = await artifact.uploadArtifact(output, [output], process.cwd());
    core.setOutput("artifact-id", id);

    await cleanup(input);
  } catch (error) {
    await cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export function artifactName(repo: string, version: string, target: string): string {
  return `${repo}-${version}-${target}-debian.zip`;
}

export const artifactRegExp: RegExp = /^.*-debian\.zip$/;

export async function cleanup(input: Input) {
  const repoPath = input.repo.split("/")[1];
  core.info(`Deleting repository ${repoPath}`);
  await rm(repoPath, { recursive: true, force: true });
}
