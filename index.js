/**
 * dsh-flutter-sandbox: a drop-in replacement for `@deepseek-ai/dsh-sandbox-local`
 * that lets `workspace-write` commands also write the Flutter, Dart, Gradle,
 * and Android directories outside the workspace (the SDK checkout's
 * `bin/cache`, the pub cache, tool settings), plus any configured roots.
 *
 * It wraps the stock provider: the stock runner profile is built first, then
 * one writable grant per extra root is inserted before the `--` that precedes
 * the command, in the selected runner's own dialect.
 *
 * @module dsh-flutter-sandbox
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import { flutterRoots, withExtraRoots } from './roots.js'

/** Prompt-context order right after the stock `sandbox:policy` entry (110 in dsh 0.1.x). */
const CONTEXT_ORDER_AFTER_POLICY = 111

/** `@deepseek-ai/dsh-sandbox-local` plus extra `workspace-write` roots. */
export class FlutterSandboxProvider extends LocalSandboxProvider {
  static Config = z.intersect([
    LocalSandboxProvider.Config,
    z.object({
      flutter: z.boolean().default(true).description('Grant the Flutter SDK, pub cache, Dart/Flutter settings, Gradle, and Android directories.'),
      extraWritableRoots: z.array(z.string()).default([]).description('Additional absolute directories workspace-write may modify.'),
    }),
  ])

  constructor(ctx, config) {
    super(ctx, config)
    for (const root of config.extraWritableRoots) {
      if (!isAbsolute(root)) throw new Error(`dsh-flutter-sandbox: extraWritableRoots entries must be absolute: ${JSON.stringify(root)}`)
    }
    this.configuredRoots = [...config.flutter ? flutterRoots() : [], ...config.extraWritableRoots]

    ctx.inject(['systemPrompt', 'sandboxPolicy'], (scope) => {
      scope.systemPrompt.context({
        name: 'sandbox:extra-writable-roots',
        order: CONTEXT_ORDER_AFTER_POLICY,
        text: (context) => {
          const session = context.agent?.session
          if (session === undefined || scope.sandboxPolicy.resolve({ session }).mode !== 'workspace-write') return ''
          const roots = this.extraRoots()
          return roots.length === 0
            ? ''
            : `Under workspace-write, sandboxed shell commands may also modify files under these directories: ${roots.map(root => JSON.stringify(root)).join(', ')}.`
        },
      })
    })
  }

  /**
   * The configured roots that currently exist, canonicalized and deduplicated.
   * Missing roots are skipped because the runners refuse to grant them.
   * @returns {string[]} the roots granted to the next confined call.
   */
  extraRoots() {
    return [...new Set(this.configuredRoots.filter(root => existsSync(root)).map(root => realpathSync.native(root)))]
  }

  confine(argv, policy, ...rest) {
    const extend = (confined) => policy.mode !== 'workspace-write'
      ? confined
      : { ...confined, argv: withExtraRoots(confined.argv, argv, this.extraRoots(), this.runnerCommand !== undefined) }
    // dsh 0.1.x returns the wrap synchronously; later versions return a Promise.
    const confined = super.confine(argv, policy, ...rest)
    return typeof confined?.then === 'function' ? confined.then(extend) : extend(confined)
  }
}

export default FlutterSandboxProvider
