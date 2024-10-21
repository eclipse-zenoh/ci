import { isPreRelease } from "../src/publish-crates-github";

describe("publish-crates-github", () => {
  test("isPreRelease()", async () => {
    expect(isPreRelease("1.0.0")).toBe(false);
    expect(isPreRelease("1.0.0.0")).toBe(true);
    expect(isPreRelease("1.0.0.11")).toBe(true);
    expect(isPreRelease("1.0.0-rc.1")).toBe(true);
    expect(isPreRelease("1.0.0.1")).toBe(true);
  });
});
