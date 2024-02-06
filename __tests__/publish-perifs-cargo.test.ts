import { describe, it } from "@jest/globals";

import { chdir } from "process";
import { tmpdir } from "os";
import { mkdtemp } from "fs/promises";

import * as publishPerifCargo from "../src/publish-perifs-cargo";

const MS_PER_MIN = 60 * 1000;

const branch = "main";
const actorName = "A U Thor";
const actorEmail = "author@example.com";
const actorEnv = {
  GIT_AUTHOR_NAME: actorName,
  GIT_AUTHOR_EMAIL: actorEmail,
  GIT_COMMITTER_NAME: actorName,
  GIT_COMMITTER_EMAIL: actorEmail,
};
const githubToken = process.env["GITHUB_TOKEN"]!;
const interDepsRegExp = /zenoh.*/i;

describe("publish peripherals cargo", () => {
  test(
    "publish zenoh cargo",
    async () => {
      const tmp = await mkdtemp(tmpdir());
      chdir(tmp);

      const input = {
        dryRun: true,
        branch,
        repos: ["ZettaScaleLabs/zenoh-staging"],
        githubToken,
        actorEnv,
        interDepsRegExp,
      };
      await publishPerifCargo.main(input);
    },
    15 * MS_PER_MIN,
  );

  test(
    "publish zenoh-plugin-ros2dds cargo",
    async () => {
      const tmp = await mkdtemp(tmpdir());
      chdir(tmp);

      const input = {
        dryRun: true,
        branch,
        repos: ["ZettaScaleLabs/zenoh-staging", "ZettaScaleLabs/zenoh-plugin-ros2dds-staging"],
        githubToken,
        actorEnv,
        interDepsRegExp,
      };
      await publishPerifCargo.main(input);
    },
    20 * MS_PER_MIN,
  );
});
