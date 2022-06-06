const { createRunOncePlugin } = require("@expo/config-plugins");
const package = require("./package.json");

const withNothing = (config) => {
  return config;
};

module.exports = createRunOncePlugin(
  withNothing,
  package.name,
  package.version
);
