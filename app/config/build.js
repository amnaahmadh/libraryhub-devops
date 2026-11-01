const fs = require('fs');
const { version } = require('../package.json');

// BUILD_NUMBER and GIT_COMMIT are passed in by the Jenkins pipeline (Part II), so every page shows
// which build and commit is currently deployed.
const build = {
  version,
  buildNumber: process.env.BUILD_NUMBER || null,
  commit: process.env.GIT_COMMIT || null,
  container: fs.existsSync('/.dockerenv'),
};

build.label = build.buildNumber
  ? `v${version} · build #${build.buildNumber}${build.commit ? ` · ${build.commit}` : ''}`
  : `v${version}`;

module.exports = build;
