#!/usr/bin/env node
import { execute } from '@oclif/core'
import { skillArgv } from './skill-flag.js'

await execute({ dir: import.meta.url, args: skillArgv(process.argv.slice(2)) })
