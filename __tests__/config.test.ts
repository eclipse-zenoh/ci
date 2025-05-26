import { describe, expect, test, jest } from "@jest/globals";

import { config, gitEnv } from "../src/config";

describe("default config", () => {
  test("default config", async () => {
    expect(config.git.user.name).toBe("eclipse-zenoh-bot");
    expect(config.git.user.email).toBe("eclipse-zenoh-bot@users.noreply.github.com");
  });

  test("default gitEnv", async () => {
    expect(gitEnv["GIT_AUTHOR_NAME"]).toBe("eclipse-zenoh-bot");
    expect(gitEnv["GIT_AUTHOR_EMAIL"]).toBe("eclipse-zenoh-bot@users.noreply.github.com");
  });
});

describe("overriden config", () => {
  let overridenConfig: typeof import("../src/config");

  beforeEach(() => {
    jest.resetModules();
    // Set environment variables for testing
    process.env.GIT_AUTHOR_NAME = "foobar";
    process.env.GIT_AUTHOR_EMAIL = "foobar@example.com";
    return import("../src/config").then(module => {
      overridenConfig = module;
    });
  });

  test("overriden gitEnv", async () => {
    expect(overridenConfig.gitEnv["GIT_AUTHOR_NAME"]).toBe("foobar");
    expect(overridenConfig.gitEnv["GIT_AUTHOR_EMAIL"]).toBe("foobar@example.com");
  });
});
