import * as fs from "fs/promises";
import * as crypto from "crypto";

import * as core from "@actions/core";

import { sh } from "./command";
import * as path from "path";
import * as ssh from "./ssh";
import * as zip from "./zip";

export type Input = {
  dryRun: boolean;
  version: string;
  repo: string;
  branch: string;
  artifactRegExp: RegExp;
  formulae: string[];
  tap: string;
  sshHost: string;
  sshHostUrl: string;
  sshHostPath: string;
  sshPrivateKey: string;
  sshPassphrase: string;
  githubToken: string;
  actorEnv: NodeJS.ProcessEnv;
};

export function setup(): Input {
  const dryRun = core.getBooleanInput("dry-run", { required: true });
  const version = core.getInput("version", { required: true });
  const repo = core.getInput("repo", { required: true });
  const branch = core.getInput("branch", { required: true });
  const artifactPatterns = core.getInput("artifact-patterns", { required: true });
  const formulae = core.getInput("formulae", { required: true });
  const tap = core.getInput("tap", { required: true });
  const sshHost = core.getInput("ssh-host", { required: true });
  const sshHostUrl = core.getInput("ssh-host-url", { required: true });
  const sshHostPath = core.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core.getInput("ssh-passphrase", { required: true });
  const githubToken = core.getInput("github-token", { required: true });
  const actorName = core.getInput("actor-name", { required: true });
  const actorEmail = core.getInput("actor-email", { required: true });

  return {
    dryRun,
    version,
    repo,
    branch,
    artifactRegExp: new RegExp(artifactPatterns.split("\n").join("|")),
    formulae: formulae.split("\n"),
    tap,
    sshHost,
    sshHostUrl,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    githubToken,
    actorEnv: {
      GIT_AUTHOR_NAME: actorName,
      GIT_AUTHOR_EMAIL: actorEmail,
      GIT_COMMITTER_NAME: actorName,
      GIT_COMMITTER_EMAIL: actorEmail,
    },
  };
}

const X86_64_APPLE_DARWIN = "x86_64-apple-darwin";
const AARCH64_APPLE_DARWIN = "aarch64-apple-darwin";

const TARGETS = [X86_64_APPLE_DARWIN, AARCH64_APPLE_DARWIN];

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
    const remote = `https://${input.githubToken}@github.com/${input.repo}.git`;
    const tapPath = `${sh(`brew --repository`).trim()}/Library/Taps/${input.tap}`;
    const tapUrl = `https://${input.githubToken}@github.com/${input.tap}.git`;

    sh(`git clone --recursive --single-branch --branch ${input.branch} ${remote}`);

    for (const target of TARGETS) {
      sh(`rustup target add ${target}`, { cwd: repo });
    }

    // NOTE: See Cargo's (-Z) multitarget feature
    sh(`cargo build --release --bins --lib ${TARGETS.map(t => `--target ${t}`).join(" ")}`, { cwd: repo });

    for (const target of TARGETS) {
      const outputArchive = `${repo}-${input.version}-${target}.zip`;
      await zip.fromDirectory(outputArchive, path.join(repo, "target", target, "release"), input.artifactRegExp);

      if (!input.dryRun) {
        await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
          sh(`ssh -v -o StrictHostKeyChecking=no ${input.sshHost} mkdir -p ${input.sshHostPath}`, { env });
          sh(`scp -v -o StrictHostKeyChecking=no -r ${outputArchive} ${input.sshHost}:${input.sshHostPath}`, { env });
        });
      }
    }

    sh(`brew untap ${input.tap}`, { check: false });
    sh(`brew tap ${input.tap} ${tapUrl}`);

    const releasePath = `${tapPath}/release.json`;
    const releaseFile = await fs.readFile(releasePath, "utf-8");
    const release = JSON.parse(releaseFile) as Release;

    const sha256 = async (target: string): Promise<string> => {
      const archive = `${repo}-${input.version}-${target}.zip`;
      const contents = await fs.readFile(archive);
      return crypto.createHash("sha256").update(contents).digest("hex");
    };

    const url = (target: string): string => {
      const baseUrl = input.dryRun ? `file://${process.cwd()}` : input.sshHostUrl;
      return `${baseUrl}/${repo}-${input.version}-${target}.zip`;
    };

    for (const formula of input.formulae) {
      release[formula] = {
        [X86_64_URL]: url(X86_64_APPLE_DARWIN),
        [X86_64_SHA256]: await sha256(X86_64_APPLE_DARWIN),
        [AARCH64_URL]: url(AARCH64_APPLE_DARWIN),
        [AARCH64_SHA256]: await sha256(AARCH64_APPLE_DARWIN),
      };
    }

    await fs.writeFile(releasePath, JSON.stringify(release, null, 2));
    const message = `chore: Bump ${input.formulae.join(", ")} to \`${input.version}\``;
    sh(`git commit ${releasePath} --message '${message}'`, { cwd: tapPath, env: input.actorEnv });

    for (const formula of input.formulae) {
      sh(`brew audit ${formula}`);
      sh(`brew install --force ${formula}`);
      sh(`brew uninstall --force --ignore-dependencies ${formula}`);
    }

    if (!input.dryRun) {
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
  sh(`rm -r *`);
}
