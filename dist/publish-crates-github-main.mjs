// src/publish-crates-github.ts
import * as core5 from "@actions/core";
import { DefaultArtifactClient as DefaultArtifactClient3 } from "@actions/artifact";

// src/command.ts
import { spawnSync } from "child_process";
import * as core from "@actions/core";
var MAX_BUFFER = 10 * 1024 * 1024;
function sh(cmd, options) {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";
  options.quiet = options.quiet != null ? options.quiet : false;
  core.startGroup(`\x1B[1m\x1B[35m${cmd}\x1B[0m`);
  const returns = spawnSync(cmd, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring order is important
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "pipe",
    shell: true,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER
  });
  if (returns.stdout != "" && !options.quiet) {
    core.info(`\x1B[1mstdout:\x1B[0m`);
    core.info(returns.stdout);
  }
  if (returns.stderr != "" && !options.quiet) {
    core.info(`\x1B[1mstderr:\x1B[0m`);
    core.info(returns.stderr);
  }
  core.endGroup();
  if (options.check && returns.status != 0) {
    throw new Error(`\`${cmd}\` failed with status code ${returns.status}:
${returns.stderr}`);
  }
  return returns.stdout;
}
function exec(program, args, options) {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";
  core.startGroup(`\x1B[1m\x1B[35m${program}(${args.join(", ")})\x1B[0m`);
  const returns = spawnSync(program, args, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring is order is
    // important
    env: {
      ...process.env,
      ...options.env
    },
    stdio: "pipe",
    shell: false,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER
  });
  if (returns.stdout != "") {
    core.info(`\x1B[1mstdout:\x1B[0m`);
    core.info(returns.stdout);
  }
  if (returns.stderr != "") {
    core.info(`\x1B[1mstderr:\x1B[0m`);
    core.info(returns.stderr);
  }
  core.endGroup();
  if (options.check && returns.status != 0) {
    throw new Error(`\`${program}(${args.join(", ")})\` failed with status code ${returns.status}:
${returns.stderr}`);
  }
  return returns.stdout;
}

// src/publish-crates-github.ts
import path from "path";

// src/build-crates-debian.ts
import * as core3 from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

// src/cargo.ts
import * as os from "os";
import { join } from "path";
import * as core2 from "@actions/core";
import * as cache from "@actions/cache";

// src/toml.ts
import * as fs from "fs/promises";
var TOML = class _TOML {
  static async init() {
    await installBinaryCached("toml-cli2");
    return new _TOML();
  }
  get(path2, key) {
    const query = key == void 0 ? "." : key.join(".");
    const out = exec("toml", ["get", path2, query], { check: false });
    if (out) {
      return JSON.parse(out);
    } else {
      return void 0;
    }
  }
  async set(path2, key, value) {
    const query = key.join(".");
    await fs.writeFile(path2, exec("toml", ["set", path2, query, value]));
  }
  async unset(path2, key) {
    const query = key.join(".");
    await fs.writeFile(path2, exec("toml", ["unset", path2, query]));
  }
};

// ci.config.json
var ci_config_default = {
  git: {
    user: {
      name: "eclipse-zenoh-bot",
      email: "eclipse-zenoh-bot@users.noreply.github.com"
    }
  },
  lock: {
    cratesio: {
      "cargo-deb": "2.1.0",
      estuary: "0.1.1",
      cross: "0.2.5",
      "toml-cli2": "0.3.2"
    },
    git: {
      estuary: {
        url: "https://github.com/ZettaScaleLabs/estuary.git",
        branch: "main"
      }
    }
  }
};

// src/config.ts
var config = ci_config_default;
var gitEnv = {
  GIT_AUTHOR_NAME: config.git.user.name,
  GIT_AUTHOR_EMAIL: config.git.user.email,
  GIT_COMMITTER_NAME: config.git.user.name,
  GIT_COMMITTER_EMAIL: config.git.user.email
};

// src/cargo.ts
var toml = await TOML.init();
async function installBinaryCached(name) {
  if (process.env["GITHUB_ACTIONS"] != void 0) {
    const paths = [join(os.homedir(), ".cargo", "bin")];
    const version = config.lock.cratesio[name];
    const key = `${os.platform()}-${os.release()}-${os.arch()}-${name}-${version}`;
    const hit = await cache.restoreCache(paths, key);
    if (hit == void 0) {
      sh(`cargo +stable install ${name} --force`);
      await cache.saveCache(paths, key);
    }
  } else {
    sh(`cargo +stable install ${name}`);
  }
}

// src/build-crates-debian.ts
var artifact = new DefaultArtifactClient();
var toml2 = await TOML.init();
var artifactRegExp = /^.*-debian\.zip$/;

// src/build-crates-standalone.ts
import * as core4 from "@actions/core";
import { DefaultArtifactClient as DefaultArtifactClient2 } from "@actions/artifact";
var artifact2 = new DefaultArtifactClient2();
var artifactRegExp2 = /^.*-standalone\.zip$/;

// src/publish-crates-github.ts
var artifact3 = new DefaultArtifactClient3();
function setup() {
  const liveRun = core5.getBooleanInput("live-run", { required: true });
  const repo = core5.getInput("repo", { required: true });
  const version = core5.getInput("version", { required: true });
  const branch = core5.getInput("branch", { required: true });
  const githubToken = core5.getInput("github-token", { required: true });
  const archivePatterns = core5.getInput("archive-patterns", { required: false });
  return {
    liveRun,
    version,
    branch,
    repo,
    githubToken,
    archiveRegExp: archivePatterns == "" ? void 0 : new RegExp(archivePatterns.split("\n").join("|"))
  };
}
async function main(input) {
  try {
    const env = {
      GH_TOKEN: input.githubToken
    };
    const releasesRaw = (
      // NOTE: We use compute the latest release (or pre-release) and use its tag name as the
      // starting tag for the next release.
      sh(`gh release list --repo ${input.repo} --exclude-drafts --order desc --json tagName`, { env })
    );
    const releases = JSON.parse(releasesRaw);
    const releaseLatest = releases.at(0);
    if (input.liveRun) {
      const command = ["gh", "release", "create", input.version];
      command.push("--repo", input.repo);
      command.push("--target", input.branch);
      command.push("--verify-tag");
      command.push("--generate-notes");
      if (releaseLatest != void 0) {
        command.push("--notes-start-tag", releaseLatest.tagName);
      }
      if (isPreRelease(input.version)) {
        command.push("--prerelease");
      }
      sh(command.join(" "), { env });
    }
    const shouldPublishArtifact = (name) => {
      if (input.archiveRegExp == void 0) {
        return artifactRegExp2.test(name) || artifactRegExp.test(name);
      } else {
        return input.archiveRegExp.test(name);
      }
    };
    const results = await artifact3.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (shouldPublishArtifact(result.name)) {
        const { downloadPath } = await artifact3.downloadArtifact(result.id);
        const archive = path.join(downloadPath, result.name);
        core5.info(`Uploading ${archive} to github.com/${input.repo}`);
        if (input.liveRun) {
          sh(`gh release upload ${input.version} ${archive} --repo ${input.repo} --clobber`, { env });
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) core5.setFailed(error.message);
  }
}
function isPreRelease(version) {
  if (version.indexOf("-") > 0 || version.split(".").length == 4) {
    return true;
  }
  return false;
}

// src/publish-crates-github-main.ts
await main(setup());
