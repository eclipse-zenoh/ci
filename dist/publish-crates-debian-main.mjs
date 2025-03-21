// src/publish-crates-debian.ts
import * as fs3 from "fs/promises";
import * as core4 from "@actions/core";
import { DefaultArtifactClient as DefaultArtifactClient2 } from "@actions/artifact";

// src/ssh.ts
import * as fs from "fs/promises";

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

// src/ssh.ts
function setupAgent() {
  const commands = sh("ssh-agent -s");
  return Object.fromEntries([...commands.matchAll(/([A-Z_]+)=([^;]+);/g)].map((m) => [m[1], m[2]]));
}
async function withIdentity(privateKey, passphrase, fn) {
  const env = setupAgent();
  const passphrasePath = "./.ssh_askpass";
  await fs.writeFile(passphrasePath, `echo '${passphrase}'`, { mode: fs.constants.S_IRWXU });
  sh("ssh-add -", {
    input: privateKey.trim().concat("\n"),
    env: { DISPLAY: "NONE", SSH_ASKPASS: passphrasePath, ...env }
  });
  fn(env);
  await fs.rm(passphrasePath);
  sh("ssh-add -D", { env });
}

// src/publish-crates-debian.ts
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
import * as fs2 from "fs/promises";
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
    await fs2.writeFile(path2, exec("toml", ["set", path2, query, value]));
  }
  async unset(path2, key) {
    const query = key.join(".");
    await fs2.writeFile(path2, exec("toml", ["unset", path2, query]));
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

// src/publish-crates-debian.ts
var artifact2 = new DefaultArtifactClient2();
var sourcesListName = "publish-crates-debian.list";
var sourcesListDir = "/etc/apt/sources.list.d";
function setup() {
  const liveRun = core4.getBooleanInput("live-run", { required: true });
  const version = core4.getInput("version", { required: true });
  const sshHost = core4.getInput("ssh-host", { required: true });
  const sshHostPath = core4.getInput("ssh-host-path", { required: true });
  const sshPrivateKey = core4.getInput("ssh-private-key", { required: true });
  const sshPassphrase = core4.getInput("ssh-passphrase", { required: true });
  const installationTest = core4.getBooleanInput("installation-test", { required: true });
  const repo = core4.getInput("repo", { required: true });
  return {
    liveRun,
    version,
    sshHost,
    sshHostPath,
    sshPrivateKey,
    sshPassphrase,
    installationTest,
    repo
  };
}
async function main(input) {
  try {
    const results = await artifact2.listArtifacts({ latest: true });
    for (const result of results.artifacts) {
      if (artifactRegExp.test(result.name)) {
        const { downloadPath } = await artifact2.downloadArtifact(result.id);
        const archive = path.join(downloadPath, result.name);
        sh(`unzip ${archive} -d ${input.version}`);
      }
    }
    const gitRepo = input.repo.split("/")[1];
    const debianRepo = `${input.sshHost}:${input.sshHostPath}`;
    const packagesPath = `.Packages-${gitRepo}-${input.version}`;
    const allPackagesPath = "Packages";
    const allPackagesGzippedPath = "Packages.gz";
    await withIdentity(input.sshPrivateKey, input.sshPassphrase, (env) => {
      sh(`scp -v -o StrictHostKeyChecking=no -r ${debianRepo}/.Packages-* ./`, { check: false, env });
    });
    sh("sudo apt-get update");
    sh("sudo apt-get install -y dpkg-dev");
    await fs3.writeFile(packagesPath, sh(`dpkg-scanpackages --multiversion ${input.version}`));
    sh(`cat .Packages-* > ${allPackagesPath}`, { quiet: true });
    sh(`gzip -k -9 ${allPackagesPath}`, { quiet: true });
    sh("ls -R");
    core4.info(`Adding a local Debian repository at ${process.cwd()}`);
    await fs3.writeFile(sourcesListName, `deb [trusted=yes] file:${process.cwd()} /`);
    sh(`sudo cp ${sourcesListName} ${sourcesListDir}`);
    sh(`cat ${sourcesListDir}/${sourcesListName}`);
    sh("sudo apt-get update");
    if (input.installationTest) {
      const debs = /* @__PURE__ */ new Set();
      for await (const dirent of await fs3.opendir(input.version)) {
        const debPath = path.join(dirent.path, dirent.name);
        const package_ = sh(`dpkg-deb --field ${debPath} Package`).trim();
        debs.add(package_);
      }
      debs.forEach((deb) => {
        sh(`sudo apt-get install -y ${deb}`);
      });
      debs.forEach((deb) => {
        sh(`sudo dpkg --purge --force-all ${deb}`);
      });
    }
    if (input.liveRun) {
      await withIdentity(input.sshPrivateKey, input.sshPassphrase, (env) => {
        const files = [allPackagesGzippedPath, packagesPath, input.version].join(" ");
        sh(`ssh -v -o StrictHostKeyChecking=no ${input.sshHost} mkdir -p ${input.sshHostPath}`, { env });
        sh(`scp -v -o StrictHostKeyChecking=no -r ${files} ${debianRepo}`, { env });
      });
    }
    cleanup();
  } catch (error) {
    cleanup();
    if (error instanceof Error) core4.setFailed(error.message);
  }
}
function cleanup() {
  sh(`sudo rm ${sourcesListDir}/${sourcesListName}`, { check: false });
}

// src/publish-crates-debian-main.ts
await main(setup());
