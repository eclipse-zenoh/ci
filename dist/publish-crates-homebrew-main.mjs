// src/publish-crates-homebrew.ts
import * as fs4 from "fs/promises";
import * as core4 from "@actions/core";
import { DefaultArtifactClient as DefaultArtifactClient2 } from "@actions/artifact";

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

// src/checksum.ts
import * as crypto from "crypto";
import * as fs from "fs/promises";
async function sha256(path) {
  const contents = await fs.readFile(path);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

// src/ssh.ts
import * as fs2 from "fs/promises";
function setupAgent() {
  const commands = sh("ssh-agent -s");
  return Object.fromEntries([...commands.matchAll(/([A-Z_]+)=([^;]+);/g)].map((m) => [m[1], m[2]]));
}
async function withIdentity(privateKey, passphrase, fn) {
  const env = setupAgent();
  const passphrasePath = "./.ssh_askpass";
  await fs2.writeFile(passphrasePath, `echo '${passphrase}'`, { mode: fs2.constants.S_IRWXU });
  sh("ssh-add -", {
    input: privateKey.trim().concat("\n"),
    env: { DISPLAY: "NONE", SSH_ASKPASS: passphrasePath, ...env }
  });
  fn(env);
  await fs2.rm(passphrasePath);
  sh("ssh-add -D", { env });
}

// src/build-crates-standalone.ts
import * as core3 from "@actions/core";
import { DefaultArtifactClient } from "@actions/artifact";

// src/cargo.ts
import * as os from "os";
import { join } from "path";
import * as core2 from "@actions/core";
import * as cache from "@actions/cache";

// src/toml.ts
import * as fs3 from "fs/promises";
var TOML = class _TOML {
  static async init() {
    await installBinaryCached("toml-cli2");
    return new _TOML();
  }
  get(path, key) {
    const query = key == void 0 ? "." : key.join(".");
    return JSON.parse(exec("toml", ["get", path, query]));
  }
  async set(path, key, value) {
    const query = key.join(".");
    await fs3.writeFile(path, exec("toml", ["set", path, query, value]));
  }
  async unset(path, key) {
    const query = key.join(".");
    await fs3.writeFile(path, exec("toml", ["unset", path, query]));
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

// src/build-crates-standalone.ts
var artifact = new DefaultArtifactClient();
function artifactName(repo, version, target) {
  return `${repo}-${version}-${target}-standalone.zip`;
}

// src/publish-crates-homebrew.ts
var artifact2 = new DefaultArtifactClient2();
function setup() {
  const liveRun = core4.getBooleanInput("live-run", { required: true });
  const version = core4.getInput("version", { required: true });
  const repo = core4.getInput("repo", { required: true });
  const formulae = core4.getInput("formulae", { required: true });
  const tap = core4.getInput("tap", { required: true });
  const sshHost = core4.getInput("ssh-host", { required: true });
  const sshHostUrl = core4.getInput("ssh-host-url", { required: true });
  const sshHostPath = core4.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core4.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core4.getInput("ssh-passphrase", { required: true });
  const githubToken = core4.getInput("github-token", { required: true });
  return {
    liveRun,
    version,
    repo,
    formulae: formulae.split("\n"),
    tap,
    sshHost,
    sshHostUrl,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    githubToken
  };
}
var X86_64_APPLE_DARWIN = "x86_64-apple-darwin";
var AARCH64_APPLE_DARWIN = "aarch64-apple-darwin";
var AARCH64_URL = "aarch64-url";
var AARCH64_SHA256 = "aarch64-sha256";
var X86_64_URL = "x86_64-url";
var X86_64_SHA256 = "x86_64-sha256";
async function main(input) {
  try {
    const repo = input.repo.split("/").at(1);
    const tapPath = `${sh("brew --repository").trim()}/Library/Taps/${input.tap}`;
    const tapUrl = `https://${input.githubToken}@github.com/${input.tap}.git`;
    for (const target of [X86_64_APPLE_DARWIN, AARCH64_APPLE_DARWIN]) {
      const name = artifactName(repo, input.version, target);
      const result = await artifact2.getArtifact(name);
      await artifact2.downloadArtifact(result.artifact.id);
      if (input.liveRun) {
        await withIdentity(input.sshPrivateKey, input.sshPassphrase, (env) => {
          sh(`ssh -v -o StrictHostKeyChecking=no ${input.sshHost} mkdir -p ${input.sshHostPath}`, { env });
          sh(`scp -v -o StrictHostKeyChecking=no -r ${name} ${input.sshHost}:${input.sshHostPath}`, { env });
        });
      }
    }
    sh(`brew untap ${input.tap}`, { check: false });
    sh(`brew tap ${input.tap} ${tapUrl}`);
    const releasePath = `${tapPath}/release.json`;
    const releaseFile = await fs4.readFile(releasePath, "utf-8");
    const release2 = JSON.parse(releaseFile);
    const url = (target) => {
      const baseUrl = input.liveRun ? input.sshHostUrl : `file://${process.cwd()}`;
      return `${baseUrl}/${artifactName(repo, input.version, target)}`;
    };
    for (const formula of input.formulae) {
      release2[formula] = {
        [X86_64_URL]: url(X86_64_APPLE_DARWIN),
        [X86_64_SHA256]: await sha256(artifactName(repo, input.version, X86_64_APPLE_DARWIN)),
        [AARCH64_URL]: url(AARCH64_APPLE_DARWIN),
        [AARCH64_SHA256]: await sha256(artifactName(repo, input.version, AARCH64_APPLE_DARWIN))
      };
    }
    await fs4.writeFile(releasePath, JSON.stringify(release2, null, 2));
    const message = `chore: Bump ${input.formulae.join(", ")} to \`${input.version}\``;
    sh(`git commit ${releasePath} --message '${message}'`, { cwd: tapPath, env: gitEnv });
    for (const formula of input.formulae) {
      sh(`brew audit ${formula}`);
      sh(`brew install --force ${formula}`);
      sh(`brew uninstall --force --ignore-dependencies ${formula}`);
      sh("brew autoremove");
    }
    if (input.liveRun) {
      sh(`git pull ${tapUrl} --rebase`, { cwd: tapPath });
      sh(`git push ${tapUrl}`, { cwd: tapPath });
    }
    cleanup(input);
  } catch (error) {
    cleanup(input);
    if (error instanceof Error) core4.setFailed(error.message);
  }
}
function cleanup(input) {
  for (const formula of input.formulae) {
    sh(`brew uninstall --force --ignore-dependencies ${formula}`, { check: false });
  }
  sh(`brew untap ${input.tap}`, { check: false });
}

// src/publish-crates-homebrew-main.ts
await main(setup());
