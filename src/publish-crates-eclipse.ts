import * as path from "path";

import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import * as ssh from "./ssh";
import { sh } from "./command";

import { artifactRegExp } from "./build-crates-standalone";

const artifact = new DefaultArtifactClient();

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

export async function main(input: Input) {
  try {
    const results = await artifact.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (artifactRegExp.test(result.name)) {
        const { downloadPath } = await artifact.downloadArtifact(result.id);
        const archive = path.join(downloadPath, result.name);
        const sshTarget = `${input.sshHost}:${input.sshHostPath}/${input.version}`;

        core.info(`Uploading ${archive} to eclipse.org`);
        if (input.liveRun) {
          await ssh.withIdentity(input.sshPrivateKey, input.sshPassphrase, env => {
            sh(`scp -v -o StrictHostKeyChecking=no -r ${archive} ${sshTarget}`, { env });
          });
        }
      }
    }

    cleanup();
  } catch (error) {
    cleanup();
    if (error instanceof Error) core.setFailed(error.message);
  }
}

export function cleanup() {
  sh(`rm -r *`);
}
