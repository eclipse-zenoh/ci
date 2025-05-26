import { describe, expect, test } from "@jest/globals";

import * as git from "../src/git";

describe("git", () => {
  test("isCommitHash()", async () => {
    // long format
    const longHash = "9ecc9031ac34f6ae0f8e5b996999277b02b3038e";
    expect(git.isCommitHash(longHash)).toBeTruthy();
    // short format
    const shortHash = longHash.substring(0, 7);
    expect(git.isCommitHash(shortHash)).toBeTruthy();
    //  upper case format
    const upperCase = longHash.substring(0, 7).toUpperCase();
    expect(git.isCommitHash(upperCase)).toBeTruthy();
    // invalid format
    expect(git.isCommitHash("foobar")).toBeFalsy();
  });
});
