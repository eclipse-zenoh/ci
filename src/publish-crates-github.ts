import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import { sh } from "./command";
import path from "path";

const artifact = new DefaultArtifactClient();

export type Input = {
  dryRun: boolean;
  repo: string;
  version: string;
  branch: string;
  sshPrivateKey: string;
  sshPassphrase: string;
  githubToken: string;
};

export function setup(): Input {
  const dryRun = core.getBooleanInput("dry-run", { required: true });
  const repo = core.getInput("repo", { required: true });
  const version = core.getInput("version", { required: true });
  const branch = core.getInput("branch", { required: true });
  const sshPrivateKey = core.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core.getInput("ssh-passphrase", { required: true });
  const githubToken = core.getInput("github-token", { required: true });

  return {
    dryRun,
    version,
    branch,
    repo,
    sshPrivateKey,
    sshPassphrase,
    githubToken,
  };
}

export async function main(input: Input) {
  try {
    const env = {
      GH_TOKEN: input.githubToken,
    };
    const startTag = sh("git describe --tags --abbrev=0");
    if (!input.dryRun) {
      sh(
        `gh release create ${input.version} --repo ${input.repo} --target ${input.branch} \
      --notes-start-tag ${startTag} --verify-tag --generate-notes`,
        { env },
      );
    }

    const results = await artifact.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (/^.*-artifacts$/g.test(result.name)) {
        const { downloadPath } = await artifact.downloadArtifact(result.id);
        const archive = path.join(downloadPath, `${result.name}.zip`);

        core.info(`Uploading ${archive} to github.com/${input.repo}`);
        if (!input.dryRun) {
          sh(`gh release upload ${input.version} ${archive} --repo ${input.repo} --clobber`, { env });
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
