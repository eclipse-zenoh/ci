import { describe, expect, test } from "@jest/globals";

import * as cargo from "../src/cargo";
import { publishedPackages } from "../src/publish-crates-cargo";

const package_ = (name: string, version: string, publish?: boolean): cargo.Package => ({
  name,
  version,
  manifestPath: "Cargo.toml",
  publish,
  workspaceDependencies: [],
});

describe("publish-crates-cargo", () => {
  test("filters versions already published on crates.io", async () => {
    const requests: string[] = [];
    const fetchFn = (async (url: string | URL | Request) => {
      requests.push(url.toString());
      return new Response(null, {
        status: url.toString() === "https://crates.io/api/v1/crates/published/1.0.0" ? 200 : 404,
      });
    }) as typeof fetch;

    const packages = [
      package_("published", "1.0.0"),
      package_("unpublished", "1.0.0"),
      package_("private", "1.0.0", false),
    ];

    await expect(publishedPackages(packages, fetchFn)).resolves.toEqual([packages[0]]);
    expect(requests).toEqual([
      "https://crates.io/api/v1/crates/published/1.0.0",
      "https://crates.io/api/v1/crates/unpublished/1.0.0",
    ]);
  });

  test("encodes package versions in crates.io requests", async () => {
    const fetchFn = (async (url: string | URL | Request) => {
      expect(url.toString()).toBe("https://crates.io/api/v1/crates/test-crate/1.0.0-beta.1%2Bbuild.2");
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    await expect(publishedPackages([package_("test-crate", "1.0.0-beta.1+build.2")], fetchFn)).resolves.toEqual([]);
  });

  test("fails when crates.io cannot determine publication status", async () => {
    const fetchFn = (async () => new Response(null, { status: 429 })) as typeof fetch;

    await expect(publishedPackages([package_("test-crate", "1.0.0")], fetchFn)).rejects.toThrow("HTTP 429");
  });
});
