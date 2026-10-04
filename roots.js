/**
 * Pure helpers for dsh-flutter-sandbox: Flutter root discovery and the
 * per-runner grant insertion. Kept free of dsh imports so tests run without a
 * dsh installation.
 *
 * @module dsh-flutter-sandbox/roots
 */

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/**
 * The Flutter SDK root: `$FLUTTER_ROOT`, else the directory two levels above
 * the resolved `flutter` executable on `PATH` (`<root>/bin/flutter`).
 * @param {NodeJS.ProcessEnv} env - the environment to read.
 * @returns {string | undefined} the SDK root, or `undefined` when not found.
 */
export function flutterSdkRoot(env = process.env) {
  if (env.FLUTTER_ROOT) return env.FLUTTER_ROOT
  try {
    const command = process.platform === 'win32' ? 'where' : 'which'
    const found = execFileSync(command, ['flutter'], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/u)[0]
    return found ? dirname(dirname(realpathSync.native(found))) : undefined
  } catch {
    // `which` exits non-zero when flutter is not on PATH.
    return undefined
  }
}

/**
 * The directories Flutter tooling writes outside a project.
 * @param {NodeJS.ProcessEnv} env - the environment to read.
 * @param {string} home - the user's home directory.
 * @returns {string[]} candidate roots; callers keep only existing ones.
 */
export function flutterRoots(env = process.env, home = homedir()) {
  const configHome = env.XDG_CONFIG_HOME || join(home, '.config')
  return [
    flutterSdkRoot(env),
    env.PUB_CACHE || join(home, '.pub-cache'),
    join(home, '.dart-tool'),
    join(home, '.dartServer'),
    join(home, '.flutter'),
    join(configHome, 'flutter'),
    env.GRADLE_USER_HOME || join(home, '.gradle'),
    join(home, '.android'),
  ].filter(root => root !== undefined)
}

/**
 * Insert writable grants for `roots` into a stock confined argv.
 * @param {string[]} confinedArgv - the stock runner invocation, ending in `--` and `argv`.
 * @param {readonly string[]} argv - the caller's command argv.
 * @param {readonly string[]} roots - canonical absolute roots to grant.
 * @param {boolean} bwrapShaped - whether a configured `runnerCommand` speaks the bwrap profile.
 * @returns {string[]} the runner invocation with the extra grants.
 */
export function withExtraRoots(confinedArgv, argv, roots, bwrapShaped) {
  if (roots.length === 0) return confinedArgv
  const separator = confinedArgv.length - argv.length - 1
  if (confinedArgv[separator] !== '--') {
    throw new Error('dsh-flutter-sandbox: unexpected sandbox argv layout; this dsh version is not supported')
  }
  const runner = basename(confinedArgv[0] ?? '')
  const head = confinedArgv.slice(0, separator)
  const tail = confinedArgv.slice(separator)
  if (bwrapShaped || runner === 'bwrap') {
    return [...head, ...roots.flatMap(root => ['--bind', root, root]), ...tail]
  }
  if (runner === 'landlock-run') {
    return [...head, ...roots.flatMap(root => ['--rw', root]), ...tail]
  }
  if (runner === 'sandbox-exec') {
    const profileIndex = head.indexOf('-p') + 1
    if (profileIndex === 0) throw new Error('dsh-flutter-sandbox: sandbox-exec profile not found')
    const quoted = roots.map(root => `(subpath "${root.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`).join(' ')
    head[profileIndex] = `${head[profileIndex]} (allow file-write* ${quoted})`
    return [...head, ...tail]
  }
  throw new Error(`dsh-flutter-sandbox: the ${runner} sandbox runner cannot grant extra writable roots`)
}
