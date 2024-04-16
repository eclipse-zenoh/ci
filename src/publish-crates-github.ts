import * as core from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

import { sh } from "./command";
import path from "path";

import { artifactRegExp as artfifactRegExpDebain } from "./build-crates-debian";
import { artifactRegExp as artfifactRegExpStandalone } from "./build-crates-standalone";

const artifact = new DefaultArtifactClient();

export type Input = {
  liveRun: boolean;
  repo: string;
  version: string;
  branch: string;
  githubToken: string;
  archiveRegExp?: RegExp;
};

export function setup(): Input {
  const liveRun = core.getBooleanInput("live-run", { required: true });
  const repo = core.getInput("repo", { required: true });
  const version = core.getInput("version", { required: true });
  const branch = core.getInput("branch", { required: true });
  const githubToken = core.getInput("github-token", { required: true });
  const archivePatterns = core.getInput("archive-patterns", { required: false });

  return {
    liveRun,
    version,
    branch,
    repo,
    githubToken,
    archiveRegExp: archivePatterns == "" ? undefined : new RegExp(archivePatterns.split("\n").join("|")),
  };
}

export async function main(input: Input) {
  try {
    const env = {
      GH_TOKEN: input.githubToken,
    };

    if (input.liveRun) {
      // NOTE: We assume that a `${input.version}-dev` exists in the target
      // branch and that it represents the starting tag of the release. If such
      // a tag does not exist, the GitHub release creation will fail
      const startTag = input.version.concat("-dev");
      sh(
        `gh release create ${input.version} \
        --repo ${input.repo} \
        --target ${input.branch} \
        --notes-start-tag ${startTag} --verify-tag --generate-notes`,
        { env },
      );
    }

    const shouldPublishArtifact = (name: string): boolean => {
      if (input.archiveRegExp == undefined) {
        return artfifactRegExpStandalone.test(name) || artfifactRegExpDebain.test(name);
      } else {
        return input.archiveRegExp.test(name);
      }
    };

    const results = await artifact.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (shouldPublishArtifact(result.name)) {
        const { downloadPath } = await artifact.downloadArtifact(result.id);
        const archive = path.join(downloadPath, result.name);

        core.info(`Uploading ${archive} to github.com/${input.repo}`);
        if (input.liveRun) {
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
