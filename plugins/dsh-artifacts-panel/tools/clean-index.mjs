#!/usr/bin/env node
/**
 * Uninstall / reset helper for the cross-session artifact index.
 *
 * Removes ONLY `<plugin>/.index/` — the private reference index this plugin
 * writes. It never touches `~/.dsh`, session logs, the DSH projection cache,
 * or any other file.
 *
 * Usage:
 *   node tools/clean-index.mjs            # remove the index
 *   node tools/clean-index.mjs --dry-run  # report what would be removed
 *   node tools/clean-index.mjs --dir /absolute/path/to/.index
 *
 * The script refuses any target whose basename is not `.index`, so a mistyped
 * `--dir` can never delete a broader directory.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const options = { dryRun: false, dir: path.join(pluginDir, '.index') }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--dir') {
      const next = argv[index + 1]
      if (!next) throw new Error('--dir needs an absolute path')
      options.dir = next
      index += 1
    } else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error('unknown argument: ' + arg)
  }
  return options
}

async function directoryStats(target) {
  let files = 0
  let bytes = 0
  let entries
  try {
    entries = await fs.readdir(target, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists: false, files: 0, bytes: 0 }
    throw error
  }
  for (const entry of entries) {
    const child = path.join(target, entry.name)
    if (entry.isDirectory()) {
      const nested = await directoryStats(child)
      files += nested.files
      bytes += nested.bytes
    } else if (entry.isFile()) {
      const stat = await fs.stat(child)
      files += 1
      bytes += stat.size
    }
  }
  return { exists: true, files, bytes }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('Usage: node tools/clean-index.mjs [--dry-run] [--dir <absolute .index path>]')
    return
  }
  const target = path.resolve(options.dir)
  if (path.basename(target) !== '.index') {
    throw new Error('refusing to remove ' + JSON.stringify(target) + ': the target basename must be exactly ".index"')
  }
  const stats = await directoryStats(target)
  if (!stats.exists) {
    console.log('artifact index not present: ' + target)
  } else if (options.dryRun) {
    console.log('[dry-run] would remove ' + target + ' (' + stats.files + ' files, ' + stats.bytes + ' bytes)')
  } else {
    await fs.rm(target, { recursive: true, force: true })
    console.log('removed artifact index: ' + target + ' (' + stats.files + ' files, ' + stats.bytes + ' bytes)')
  }
  console.log('projection cache note: the host-only `artifactIndex` unit may leave checkpoints inside DSH\'s own')
  console.log('projection cache after uninstall. That cache lives under ~/.dsh and is intentionally not touched')
  console.log('by this script. It stores the same reference-only rows and is discarded when DSH rebuilds the cache;')
  console.log('re-enabling this plugin simply refolds each session log from its checkpoint.')
}

main().catch(function (error) {
  console.error('[clean-index] ' + (error && error.message ? error.message : String(error)))
  process.exitCode = 1
})
