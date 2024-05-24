import * as fs from "fs/promises";
import * as crypto from "crypto";

import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import { sh } from "./command";
import { sha256 } from "./checksum";
import * as ssh from "./ssh";

import { artifactName } from "./build-crates-standalone";
import { gitEnv } from "./config";

const artifact = new DefaultArtifactClient();

export type Input = {
  liveRun: boolean;
  version: string;
  repo: string;
  formulae: string[];
  tap: string;
  sshHost: string;
  sshHostUrl: string;
  sshHostPath: string;
  sshPrivateKey: string;
  sshPassphrase: string;
  githubToken: string;
};

export function setup(): Input {
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const version = core.getInput("version", { required: true });
  const repo = core.getInput("repo", { required: true });
  const formulae = core.getInput("formulae", { required: true });
  const tap = core.getInput("tap", { required: true });
  const sshHost = core.getInput("ssh-host", { required: true });
  const sshHostUrl = core.getInput("ssh-host-url", { required: true });
  const sshHostPath = core.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core.getInput("ssh-passphrase", { required: true });
  const githubToken = core.getInput("github-token", { required: true });

  return {
    liveRun,
    version,
    repo,
    formulae: formulae.split("\n"),
    tap,
    sshHost,
    sshHostUrl,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    githubToken,
  };
}

const X86_64_APPLE_DARWIN = "x86_64-apple-darwin";
const AARCH64_APPLE_DARWIN = "aarch64-apple-darwin";

const AARCH64_URL = "aarch64-url";
const AARCH64_SHA256 = "aarch64-sha256";
const X86_64_URL = "x86_64-url";
const X86_64_SHA256 = "x86_64-sha256";

type Release = {
  [formula: string]: {
    [AARCH64_URL]: string;
    [AARCH64_SHA256]: string;
    [X86_64_URL]: string;
    [X86_64_SHA256]: string;
  };
};

export async function main(input: Input) {
  try {
    const repo = input.repo.split("/").at(1);
    const tapPath = `${sh("brew --repository").trim()}/Library/Taps/${input.tap}`;
    const tapUrl = `https://${input.githubToken}@github.com/${input.tap}.git`;

    for (const target of [X86_64_APPLE_DARWIN, AARCH64_APPLE_DARWIN]) {
      const name = artifactName(repo, input.version, target);
      const result = await artifact.getArtifact(name);
      await artifact.downloadArtifact(result.artifact.id);

      if (input.liveRun) {
        await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
          sh(`ssh -v -o StrictHostKeyChecking=no ${input.sshHost} mkdir -p ${input.sshHostPath}`, { env });
          sh(`scp -v -o StrictHostKeyChecking=no -r ${name} ${input.sshHost}:${input.sshHostPath}`, { env });
        });
      }
    }

    sh(`brew untap ${input.tap}`, { check: false });
    sh(`brew tap ${input.tap} ${tapUrl}`);

    const releasePath = `${tapPath}/release.json`;
    const releaseFile = await fs.readFile(releasePath, "utf-8");
    const release = JSON.parse(releaseFile) as Release;

    const url = (target: string): string => {
      const baseUrl = input.liveRun ? input.sshHostUrl : `file://${process.cwd()}`;
      return `${baseUrl}/${artifactName(repo, input.version, target)}`;
    };

    for (const formula of input.formulae) {
      release[formula] = {
        [X86_64_URL]: url(X86_64_APPLE_DARWIN),
        [X86_64_SHA256]: await sha256(artifactName(repo, input.version, X86_64_APPLE_DARWIN)),
        [AARCH64_URL]: url(AARCH64_APPLE_DARWIN),
        [AARCH64_SHA256]: await sha256(artifactName(repo, input.version, AARCH64_APPLE_DARWIN)),
      };
    }

    await fs.writeFile(releasePath, JSON.stringify(release, null, 2));
    const message = `chore: Bump ${input.formulae.join(", ")} to \`${input.version}\``;
    sh(`git commit ${releasePath} --message '${message}'`, { cwd: tapPath, env: gitEnv });

    for (const formula of input.formulae) {
      sh(`brew audit ${formula}`);
      sh(`brew install --force ${formula}`);
      sh(`brew uninstall --force --ignore-dependencies ${formula}`);
      sh("brew autoremove");
    }

    if (input.liveRun) {
      sh(`git pull ${tapUrl} --rebase`, { cwd: tapPath });
      sh(`git push ${tapUrl}`, { cwd: tapPath });
    }

    cleanup(input);
  } catch (error) {
    cleanup(input);
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export function cleanup(input: Input) {
  for (const formula of input.formulae) {
    sh(`brew uninstall --force --ignore-dependencies ${formula}`, { check: false });
  }
  sh(`brew untap ${input.tap}`, { check: false });
}
