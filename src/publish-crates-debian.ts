import * as fs from "fs/promises";

import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import * as ssh from "./ssh";
import { sh } from "./command";
import path from "path";

import { artifactRegExp } from "./build-crates-debian";

const artifact = new DefaultArtifactClient();

const sourcesListName = "publish-crates-debian.list";
const sourcesListDir = "/etc/apt/sources.list.d";

export type Input = {
  liveRun: boolean;
  version: string;
  sshHost: string;
  sshHostPath: string;
  sshPrivateKey: string;
  sshPassphrase: string;
  installationTest: boolean;
  repo: string;
};

export function setup(): Input {
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const version = core.getInput("version", { required: true });
  const sshHost = core.getInput("ssh-host", { required: true });
  const sshHostPath = core.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core.getInput("ssh-passphrase", { required: true });
  const installationTest = core.getBooleanInput("installation-test", { required: true });
  const repo = core.getInput("repo", { required: true });

  return {
    liveRun,
    version,
    sshHost,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    installationTest,
    repo,
  };
}

export async function main(input: Input) {
  try {
    const results = await artifact.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (artifactRegExp.test(result.name)) {
        const { downloadPath } = await artifact.downloadArtifact(result.id);
        const archive = path.join(downloadPath, result.name);
        sh(`unzip ${archive} -d ${input.version}`);
      }
    }

    // repo is actually owner/repo so we have to split it here to get only the git repo name
    const gitRepo = input.repo.split("/")[1];
    const debianRepo = `${input.sshHost}:${input.sshHostPath}`;
    const packagesPath = `.Packages-${gitRepo}-${input.version}`;
    const allPackagesPath = "Packages";
    const allPackagesGzippedPath = "Packages.gz";

    await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
      sh(`scp -v -o StrictHostKeyChecking=no -r ${debianRepo}/.Packages-* ./`, { check: false, env });
    });

    sh("sudo apt-get update");
    sh("sudo apt-get install -y dpkg-dev");

    await fs.writeFile(packagesPath, sh(`dpkg-scanpackages --multiversion ${input.version}`));
    // NOTE: An unzipped package index is necessary for apt-get to recognize the
    // local repository created below
    sh(`cat .Packages-* > ${allPackagesPath}`, { quiet: true });
    sh(`gzip -k -9 ${allPackagesPath}`, { quiet: true });

    sh("ls -R");
    core.info(`Adding a local Debian repository at ${process.cwd()}`);
    await fs.writeFile(sourcesListName, `deb [trusted=yes] file:${process.cwd()} /`);
    // NOTE: We cannot write zenoh.list directly into /etc/apt/sources.list.d as
    // that requires sudo
    sh(`sudo cp ${sourcesListName} ${sourcesListDir}`);
    sh(`cat ${sourcesListDir}/${sourcesListName}`);
    sh("sudo apt-get update");

    if (input.installationTest) {
      const debs: Set<string> = new Set();
      for await (const dirent of await fs.opendir(input.version)) {
        const debPath = path.join(dirent.path, dirent.name);
        const package_ = sh(`dpkg-deb --field ${debPath} Package`).trim();
        debs.add(package_);
      }

      debs.forEach(deb => {
        sh(`sudo apt-get install -y ${deb}`);
      });

      debs.forEach(deb => {
        sh(`sudo dpkg --purge --force-all ${deb}`);
      });
    }

    if (input.liveRun) {
      await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
        const files = [allPackagesGzippedPath, packagesPath, input.version].join(" ");
        sh(`ssh -v -o StrictHostKeyChecking=no ${input.sshHost} mkdir -p ${input.sshHostPath}`, { env });
        sh(`scp -v -o StrictHostKeyChecking=no -r ${files} ${debianRepo}`, { env });
      });
    }

    cleanup();
  } catch (error) {
    cleanup();
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export function cleanup() {
  sh(`sudo rm ${sourcesListDir}/${sourcesListName}`, { check: false });
}
