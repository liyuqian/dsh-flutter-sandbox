# dsh-flutter-sandbox

A [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) plugin that lets Flutter and Dart run inside dsh's `workspace-write` sandbox.

Out of the box, dsh only lets sandboxed commands write the session workspace and `/tmp`. Flutter also writes outside the project on every run, so even `flutter --version` fails:

```
update_engine_version.sh: line 71: .../flutter/bin/cache/engine.stamp.tmp: Read-only file system
```

This plugin replaces dsh's stock sandbox provider with one that also grants write access to these directories (only those that exist):

| Directory | Why |
|---|---|
| Flutter SDK (`$FLUTTER_ROOT`, or found from `flutter` on `PATH`) | The tool updates `bin/cache` on every run |
| `$PUB_CACHE` or `~/.pub-cache` | Package downloads |
| `~/.dart-tool`, `~/.dartServer` | Telemetry state and analysis-server cache |
| `~/.flutter`, `$XDG_CONFIG_HOME/flutter` (`~/.config/flutter`) | Flutter settings |
| `$GRADLE_USER_HOME` or `~/.gradle`, `~/.android` | Android builds |

Everything else stays protected, and `read-only` and `danger-full-access` modes are unchanged. The model is told about the extra directories in its context.

## Install

```sh
dsh plugin --profile tui add github:liyuqian/dsh-flutter-sandbox
```

Use `--profile web` (or any other profile name) for other profiles. Remove it with `dsh plugin --profile tui remove dsh-flutter-sandbox`.

## Configure

The defaults need no configuration. To turn off the Flutter directories or add your own, override the plugin row in your profile's `cordis.patch.yml` (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

```yaml
- id: sandbox-flutter
  config:
    flutter: true               # grant the Flutter/Dart/Gradle/Android directories above
    extraWritableRoots:         # additional absolute directories
      - /home/me/.cocoapods
```

The stock provider's options (`runnerCommand`, `runnerFailureSignatures`, `probeTimeoutMs`) are accepted too.

## How it works

The plugin's bundle patch disables dsh-base's `sandbox` row (`@deepseek-ai/dsh-sandbox-local`) and inserts `sandbox-flutter`, a subclass of that provider. For each `workspace-write` call it lets the stock provider build the runner command, then inserts one grant per existing directory before the `--` that precedes your command:

- **bubblewrap** (Linux): `--bind <dir> <dir>`
- **Landlock** (Linux): `--rw <dir>`
- **Seatbelt** (macOS): `(allow file-write* (subpath "<dir>"))`

## Limitations

- **Shell commands only.** dsh's own file write/edit tools check writable paths separately and still deny these directories; the model can ask for approval as usual. Flutter, pub and Gradle write through the shell, so this does not affect them.
- **Windows is not supported.** The ACL runner cannot grant extra directories, so confined commands fail with a clear error instead of silently running without the grants.
- **Depends on the stock runner's argument layout.** A dsh release that changes it makes the plugin fail loudly with "unexpected sandbox argv layout" rather than run unconfined. Tested with dsh 0.1.1-rc.2.
- **Pub workspaces.** `flutter pub get` in a package of a pub workspace writes to the workspace root; start the dsh session at that root.

## Develop

```sh
npm test
```

The tests cover root discovery and each runner's grant insertion without a dsh installation.

## License

MIT
