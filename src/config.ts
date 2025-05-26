import _config from "../ci.config.json";

type Config = {
  git: {
    user: {
      email: string;
      name: string;
    };
  };
  lock: {
    cratesio: {
      [key: string]: string;
    };
    git: {
      [key: string]: {
        url: string;
        branch: string;
      };
    };
  };
};

export const config: Config = _config;

// Allow override of ci.config.json default values from env vars.
export const gitEnv: NodeJS.ProcessEnv = {
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || config.git.user.name,
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || config.git.user.email,
  GIT_COMMITTER_NAME: process.env.GIT_AUTHOR_NAME || config.git.user.name,
  GIT_COMMITTER_EMAIL: process.env.GIT_AUTHOR_EMAIL || config.git.user.email,
};
