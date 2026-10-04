import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flutterRoots, withExtraRoots } from '../roots.js'

const argv = ['bash', '-c', 'flutter pub get']

test('bwrap: binds each root before the command separator', () => {
  const stock = ['bwrap', '--ro-bind', '/', '/', '--tmpfs', '/tmp', '--bind', '/ws', '/ws', '--', ...argv]
  assert.deepEqual(withExtraRoots(stock, argv, ['/sdk', '/cache'], false), [
    'bwrap', '--ro-bind', '/', '/', '--tmpfs', '/tmp', '--bind', '/ws', '/ws',
    '--bind', '/sdk', '/sdk', '--bind', '/cache', '/cache', '--', ...argv,
  ])
})

test('a configured runnerCommand speaks the bwrap profile', () => {
  const stock = ['my-runner', '--bind', '/ws', '/ws', '--', ...argv]
  assert.deepEqual(withExtraRoots(stock, argv, ['/sdk'], true), ['my-runner', '--bind', '/ws', '/ws', '--bind', '/sdk', '/sdk', '--', ...argv])
})

test('landlock: grants each root read-write', () => {
  const stock = ['/x/bin/landlock-run', '--ro', '/', '--rw', '/dev/null', '--rw', '/ws', '--', ...argv]
  assert.deepEqual(withExtraRoots(stock, argv, ['/sdk'], false), ['/x/bin/landlock-run', '--ro', '/', '--rw', '/dev/null', '--rw', '/ws', '--rw', '/sdk', '--', ...argv])
})

test('seatbelt: appends one allow form to the profile', () => {
  const stock = ['/usr/bin/sandbox-exec', '-p', '(version 1) (deny file-write*)', '--', ...argv]
  assert.deepEqual(withExtraRoots(stock, argv, ['/sdk', '/a"b'], false), [
    '/usr/bin/sandbox-exec', '-p', '(version 1) (deny file-write*) (allow file-write* (subpath "/sdk") (subpath "/a\\"b"))', '--', ...argv,
  ])
})

test('no roots leaves the stock argv untouched', () => {
  const stock = ['node', 'acl-runner.js', '--', ...argv]
  assert.equal(withExtraRoots(stock, argv, [], false), stock)
})

test('an unsupported runner fails loudly', () => {
  assert.throws(() => withExtraRoots(['node', 'acl-runner.js', '--', ...argv], argv, ['/sdk'], false), /cannot grant extra writable roots/)
})

test('an unexpected argv layout fails loudly', () => {
  assert.throws(() => withExtraRoots(['bwrap', ...argv], argv, ['/sdk'], false), /unexpected sandbox argv layout/)
})

test('Flutter roots honor the tool environment variables', () => {
  const roots = flutterRoots({ FLUTTER_ROOT: '/opt/flutter', PUB_CACHE: '/pc', GRADLE_USER_HOME: '/g', XDG_CONFIG_HOME: '/cfg' }, '/home/u')
  assert.deepEqual(roots, ['/opt/flutter', '/pc', '/home/u/.dart-tool', '/home/u/.dartServer', '/home/u/.flutter', '/cfg/flutter', '/g', '/home/u/.android'])
})

test('Flutter roots default under the home directory', () => {
  const roots = flutterRoots({ FLUTTER_ROOT: '/opt/flutter' }, '/home/u')
  assert.deepEqual(roots, ['/opt/flutter', '/home/u/.pub-cache', '/home/u/.dart-tool', '/home/u/.dartServer', '/home/u/.flutter', '/home/u/.config/flutter', '/home/u/.gradle', '/home/u/.android'])
})
