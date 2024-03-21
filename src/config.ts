type Config = {
  git: {
    email: string;
    name: string;
  }
  lock: {
    cratesio: {
      [key: string]: string;
    }
  }
};

export const config: Config = require("ci.config.json");

