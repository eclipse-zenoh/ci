import * as fs from "fs/promises";
import * as zlib from "zlib";

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
};

export function setup(): Input {
  const liveRun = core.getInput("live-run");
  const version = core.getInput("version", { required: true });
  const sshHost = core.getInput("ssh-host", { required: true });
  const sshHostPath = core.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core.getInput("ssh-passphrase", { required: true });

  return {
    liveRun: liveRun == "" ? false : core.getBooleanInput("live-run"),
    version,
    sshHost,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
  };
}

function gzip(input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(input, { level: 9 }, (error, buffer) => {
      if (!error) {
        resolve(buffer);
      } else {
        reject(error);
      }
    });
  });
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

    const debianRepo = `${input.sshHost}:${input.sshHostPath}`;
    const packagesPath = `.Packages-${input.version}`;
    const allPackagesPath = "Packages";
    const allPackagesGzippedPath = "Packages.gz";

    await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
      sh(`scp -v -o StrictHostKeyChecking=no -r ${debianRepo}/.Packages-* ./`, { check: false, env });
    });

    sh("sudo apt-get update");
    sh("sudo apt-get install -y dpkg-dev");

    await fs.writeFile(packagesPath, sh(`dpkg-scanpackages --multiversion ${input.version}`));
    const packages = sh("cat .Packages-*");
    // NOTE: An unzipped package index is necessary for apt-get to recognize the
    // local repository created below
    await fs.writeFile(allPackagesPath, packages);
    await fs.writeFile(allPackagesGzippedPath, await gzip(packages));

    sh("ls -R");
    core.info(`Adding a local Debian repository at ${process.cwd()}`);
    await fs.writeFile(sourcesListName, `deb [trusted=yes] file:${process.cwd()} /`);
    // NOTE: We cannot write zenoh.list directly into /etc/apt/sources.list.d as
    // that requires sudo
    sh(`sudo cp ${sourcesListName} ${sourcesListDir}`);
    sh(`cat ${sourcesListDir}/${sourcesListName}`);
    sh("sudo apt-get update");

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
  sh(`rm -r *`);
  sh(`sudo rm ${sourcesListDir}/${sourcesListName}`);
}
