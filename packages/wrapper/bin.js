#!/usr/bin/env node

// Thin wrapper that delegates execution to the core package's oclif CLI
// Resolves the installed @theredguild/devcontainer-wizard package and runs it.

// eslint-disable-next-line unicorn/prefer-top-level-await
;(async () => {
  const oclif = await import('@oclif/core')
  const path = require('node:path')

  const corePkgPath = require.resolve('@theredguild/devcontainer-wizard/package.json')
  const coreDir = path.dirname(corePkgPath)

  await oclif.execute({ dir: coreDir })
})()

