import { spawnSync } from "child_process";
import * as core from "@actions/core";

const MAX_BUFFER = 10 * 1024 * 1024;

export type CommandOptions = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  check?: boolean;
  input?: string;
};

export function sh(cmd: string, options?: CommandOptions): string {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";

  core.startGroup(`\u001b[1m\u001b[35m${cmd}\u001b[0m`);

  const returns = spawnSync(cmd, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring is order is
    // important
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "pipe",
    shell: true,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER,
  });

  if (returns.stdout != "") {
    core.info(`\u001b[1mstdout:\u001b[0m`);
    core.info(returns.stdout);
  }

  if (returns.stderr != "") {
    core.info(`\u001b[1mstderr:\u001b[0m`);
    core.info(returns.stderr);
  }

  core.endGroup();

  if (options.check && returns.status != 0) {
    throw new Error(`\`${cmd}\` failed with status code ${returns.status}:\n${returns.stderr}`);
  }

  return returns.stdout;
}

export function exec(program: string, args: string[], options?: CommandOptions): string {
  options = options != null ? options : {};
  options.env = options.env != null ? options.env : {};
  options.cwd = options.cwd != null ? options.cwd : ".";
  options.check = options.check != null ? options.check : true;
  options.input = options.input != null ? options.input : "";

  core.startGroup(`\u001b[1m\u001b[35m${program}(${args.join(", ")})\u001b[0m`);

  const returns = spawnSync(program, args, {
    // NOTE: Environment variables defined in `options.env` take precedence over
    // the parent process's environment, thus the destructuring is order is
    // important
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "pipe",
    shell: false,
    encoding: "utf-8",
    cwd: options.cwd,
    input: options.input,
    maxBuffer: MAX_BUFFER,
  });

  if (returns.stdout != "") {
    core.info(`\u001b[1mstdout:\u001b[0m`);
    core.info(returns.stdout);
  }

  if (returns.stderr != "") {
    core.info(`\u001b[1mstderr:\u001b[0m`);
    core.info(returns.stderr);
  }

  core.endGroup();

  if (options.check && returns.status != 0) {
    throw new Error(`\`${program}(${args.join(", ")})\` failed with status code ${returns.status}:\n${returns.stderr}`);
  }

  return returns.stdout;
}
