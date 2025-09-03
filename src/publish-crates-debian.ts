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
  gpgKeyId: string;
  gpgSubkeyId: string;
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
  const gpgKeyId = core.getInput("gpg-key-id", { required: true });
  const gpgSubkeyId = core.getInput("gpg-subkey-id", { required: true });
  const installationTest = core.getBooleanInput("installation-test", { required: true });
  const repo = core.getInput("repo", { required: true });

  return {
    liveRun,
    version,
    sshHost,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    gpgKeyId,
    gpgSubkeyId,
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
        if (downloadPath == undefined) {
          throw new Error(`Failed to download artifact: ${result.name}`);
        }
        const archive = path.join(downloadPath, result.name);
        sh(`unzip ${archive} -d ${input.version}`);
      }
    }

    sh("sudo apt-get update");
    sh("sudo apt-get install -y dpkg-dev apt-utils gpg debsigs");

    // Sign the .deb files
    const dirents = await fs.readdir(`${input.version}`, { withFileTypes: true });
    const files = dirents.filter(d => d.name.endsWith(".deb"));
    files.forEach(file => {
      const filePath = path.join(`${input.version}`, file.name);
      sh(`debsigs --sign=origin -k ${input.gpgSubkeyId} ${filePath}`);
    });

    const debianRepo = `${input.sshHost}:${input.sshHostPath}`;
    // repo is actually owner/repo so we have to split it here to get only the git repo name
    const gitRepo = input.repo.split("/")[1];
    const packagesPath = `.Packages-${gitRepo}-${input.version}`;
    await fs.writeFile(packagesPath, sh(`dpkg-scanpackages --multiversion ${input.version}`));
    if (input.installationTest) {
      const allPackagesPath = "Packages";

      await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
        sh(`scp -v -o StrictHostKeyChecking=no -r ${debianRepo}/.Packages-* ./`, { check: false, env });
      });

      // NOTE: An unzipped package index is necessary for apt-get to recognize the
      // local repository created below
      sh(`cat .Packages-* > ${allPackagesPath}`, { quiet: true });

      // Create Release file
      sh(`apt-ftparchive release . > Release`, { quiet: true });

      // Sign the Release file
      sh(`gpg --armor --sign --detach-sign --default-key ${input.gpgSubkeyId} --output Release.gpg Release`);

      core.info(`Contents of ${input.version} directory:`);
      sh("ls -alhR");
      // debug
      core.info(`Contents of Release file:`);
      sh("cat Release");
      core.info(`Contents of Release.gpg file:`);
      sh("cat Release.gpg");
      core.info(`Adding a local Debian repository at ${process.cwd()}`);
      await fs.writeFile(
        sourcesListName,
        `deb [signed-by=/etc/apt/keyrings/${input.gpgSubkeyId}.gpg] file:${process.cwd()} /`,
      );

      // NOTE: We cannot write zenoh.list directly into /etc/apt/sources.list.d as
      // that requires sudo
      sh(`sudo cp ${sourcesListName} ${sourcesListDir}`);
      sh(`cat ${sourcesListDir}/${sourcesListName}`);
      // Import the GPG key for the local repository
      sh(`sudo mkdir -m 0755 -p /etc/apt/keyrings/`);
      sh(`gpg --export ${input.gpgSubkeyId} | sudo tee /etc/apt/keyrings/${input.gpgSubkeyId}.gpg`, { quiet: true });

      sh("sudo apt-get update");

      const debs: Set<string> = new Set();
      for await (const dirent of await fs.opendir(input.version)) {
        const debPath = path.join(dirent.parentPath, dirent.name);
        // filter out packages that can't be installed on this arch
        const arch = sh(`dpkg-deb --field ${debPath} Architecture`).trim();
        if (arch !== process.arch && arch !== "all") {
          core.info(
            `Skipping package ${debPath} as it is not compatible with the current architecture (${process.arch})`,
          );
          continue;
        }
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

    // On live runs we only upload the packages and the .Packages files to the eclipse-foundation server.
    // Releases, Releases.gpg and Packages.gz files will be generated by a separate workflow after all the packages are released.
    if (input.liveRun) {
      await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
        const files = [packagesPath, input.version].join(" ");
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
