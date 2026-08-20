#!/usr/bin/env node
// Dev entry: run via `node --import tsx bin/dev.js` so commands load from ./src.
import { execute } from '@oclif/core'
import { skillArgv } from './skill-flag.js'

process.env.NODE_ENV ??= 'development'

await execute({ development: true, dir: import.meta.url, args: skillArgv(process.argv.slice(2)) })
