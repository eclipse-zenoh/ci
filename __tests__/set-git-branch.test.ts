import { describe, expect, test } from "@jest/globals";

import { parseDependencies } from "../src/set-git-branch";

describe("parseDependencies", () => {
  test("parses aligned dependency mappings", () => {
    const dependencies = parseDependencies(
      ["^zenoh(?!-flat$).*", "^zenoh-flat$"],
      ["https://github.com/eclipse-zenoh/zenoh.git", "https://github.com/eclipse-zenoh/zenoh-flat.git"],
      ["main", "main"],
    );

    expect(dependencies).toHaveLength(2);
    expect(dependencies[0].pattern.test("zenoh-ext")).toBe(true);
    expect(dependencies[0].pattern.test("zenoh-flat")).toBe(false);
    expect(dependencies[0].gitUrl).toBe("https://github.com/eclipse-zenoh/zenoh.git");
    expect(dependencies[1].pattern.test("zenoh-flat")).toBe(true);
    expect(dependencies[1].gitUrl).toBe("https://github.com/eclipse-zenoh/zenoh-flat.git");
  });

  test("requires aligned dependency mappings", () => {
    expect(() => parseDependencies(["zenoh.*"], ["https://example.com/zenoh.git"], [])).toThrow(
      "deps-pattern, deps-git-url, and deps-branch must all be provided",
    );
    expect(() =>
      parseDependencies(["zenoh.*"], ["https://example.com/zenoh.git", "https://example.com/other.git"], ["main"]),
    ).toThrow("deps-pattern, deps-git-url, and deps-branch must have the same number of lines");
  });
});
