import { describe, expect, test } from "@jest/globals";

import * as cargo from "../src/cargo";
import { cratesIoIndexPath, publishedPackages } from "../src/publish-crates-cargo";

const package_ = (name: string, version: string, publish?: boolean): cargo.Package => ({
  name,
  version,
  manifestPath: "Cargo.toml",
  publish,
  workspaceDependencies: [],
});

describe("publish-crates-cargo", () => {
  test("uses Cargo's sparse index paths", () => {
    expect(cratesIoIndexPath("a")).toBe("1/a");
    expect(cratesIoIndexPath("ab")).toBe("2/ab");
    expect(cratesIoIndexPath("abc")).toBe("3/a/abc");
    expect(cratesIoIndexPath("Test-Crate")).toBe("te/st/test-crate");
  });

  test("filters versions already published on crates.io", async () => {
    const requests: string[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(url.toString());
      expect(init).toEqual({
        headers: {
          "User-Agent": "@eclipse-zenoh/ci (https://github.com/eclipse-zenoh/ci)",
        },
      });
      return new Response(
        url.toString() === "https://index.crates.io/pu/bl/published" ? '{"vers":"1.0.0"}\n' : '{"vers":"0.9.0"}\n',
        { status: 200 },
      );
    }) as typeof fetch;

    const packages = [
      package_("published", "1.0.0"),
      package_("unpublished", "1.0.0"),
      package_("private", "1.0.0", false),
    ];

    await expect(publishedPackages(packages, fetchFn)).resolves.toEqual([packages[0]]);
    expect(requests).toEqual(["https://index.crates.io/pu/bl/published", "https://index.crates.io/un/pu/unpublished"]);
  });

  test("matches versions that differ only by build metadata", async () => {
    const fetchFn = (async () => {
      return new Response('{"vers":"1.0.0-beta.1"}\n', { status: 200 });
    }) as typeof fetch;

    const packages = [package_("test-crate", "1.0.0-beta.1+build.2")];
    await expect(publishedPackages(packages, fetchFn)).resolves.toEqual(packages);
  });

  test("treats an absent crate as unpublished", async () => {
    const fetchFn = (async () => new Response(null, { status: 404 })) as typeof fetch;

    await expect(publishedPackages([package_("test-crate", "1.0.0")], fetchFn)).resolves.toEqual([]);
  });

  test("fails when crates.io cannot determine publication status", async () => {
    const fetchFn = (async () => new Response(null, { status: 403 })) as typeof fetch;

    await expect(publishedPackages([package_("test-crate", "1.0.0")], fetchFn)).rejects.toThrow("HTTP 403");
  });
});
