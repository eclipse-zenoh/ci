import { describe, test } from "@jest/globals";

import * as tagPerif from "../src/tag-perif";
import { chdir } from "process";
import { tmpdir } from "os";
import { mkdtemp } from "fs/promises";

const actorName = "A U Thor";
const actorEmail = "author@example.com";
const actorEnv = {
  GIT_AUTHOR_NAME: actorName,
  GIT_AUTHOR_EMAIL: actorEmail,
  GIT_COMMITTER_NAME: actorName,
  GIT_COMMITTER_EMAIL: actorEmail,
};

const interDepsRegExp = /zenoh.*/i;
const githubToken = process.env["GITHUB_TOKEN"]!;

describe("tag peripherals", () => {
  test("tag zenoh-plugin-ros2dds", async () => {
    const tmp = await mkdtemp(tmpdir());
    chdir(tmp);

    const input = {
      dryRun: false,
      repo: "ZettaScaleLabs/zenoh-plugin-ros2dds-staging",
      githubToken,
      actorEnv,
      interDepsRegExp,
    };
    await tagPerif.main(input);
  });

  test("tag zenoh-backend-filesystem", async () => {
    const tmp = await mkdtemp(tmpdir());
    chdir(tmp);

    const input = {
      dryRun: false,
      repo: "ZettaScaleLabs/zenoh-backend-filesystem",
      githubToken,
      actorEnv,
      interDepsRegExp,
    };
    await tagPerif.main(input);
  });

  test("tag zenoh", async () => {
    const tmp = await mkdtemp(tmpdir());
    chdir(tmp);

    const input = {
      dryRun: false,
      repo: "ZettaScaleLabs/zenoh-staging",
      githubToken,
      actorEnv,
      interDepsRegExp,
    };
    await tagPerif.main(input);
  });

  test("tag zenoh dry-run", async () => {
    const tmp = await mkdtemp(tmpdir());
    chdir(tmp);

    const input = {
      dryRun: true,
      repo: "ZettaScaleLabs/zenoh-staging",
      githubToken,
      actorEnv,
      interDepsRegExp,
    };
    await tagPerif.main(input);
  });
});
