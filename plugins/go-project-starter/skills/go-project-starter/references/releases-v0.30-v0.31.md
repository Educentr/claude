# go-project-starter v0.30.0–v0.31.0

Use this reference when upgrading an existing project or configuring the features below. Examples target **v0.31.0**. Preserve explicit versions and project settings unless the task requires an upgrade.

## Version pin and upgrade

New projects default to Go **1.27**; existing `tools.golang_version` values survive regeneration. Provision the selected toolchain locally and in CI; `GOTOOLCHAIN=auto` may download it.

Bootstrap a new project with a known generator version:

```bash
go run github.com/Educentr/go-project-starter/cmd/go-project-starter@v0.31.0 --configDir=./configs --target=./myproject
```

Since v0.31, generated `make regenerate` uses `go run $(GPSPKG)@$(GPSVERSION)`, with the generating version assigned to `tools.starter_version` internally and emitted as `GPSVERSION` in Makefile. Installing another binary in `PATH` does not change this pin. The first run needs access to the Go module proxy/cache.

```bash
make update-starter STARTER_VERSION=v0.31.0
make generate
make build
```

For an older Makefile without `update-starter`, run the selected generator directly with `--target=.` once, then use the generated targets. `tools.starter_version` is a fallback only when a local generator build cannot identify its own version; it accepts a semver tag or `latest`. For local template development invoke the rebuilt binary directly, then verify its output; `make regenerate` still uses the recorded pin.

## Safe regeneration and manifest

v0.30 adds meta version **5**, with a manifest of generated/copied files in `.project-config/meta.yaml`. Commit it with the generated tree. Older v4 projects migrate on their first run. Preserve user code below disclaimer markers.

- An edit above the marker produces a warning and is overwritten. A modified orphan is retained with a warning; migrate its contents before removing it.
- In v0.31, an existing file on a newly generated path that is absent from the manifest is a **conflict**, reported before writes. Inspect and preserve it, then move/remove the conflicting file and regenerate. Do not delete the manifest to bypass protection.
- Copied REST/gRPC/JSON Schema specs and custom contracts are **inputs**, not edit points. Local drift is a generation error in v0.31. Preserve needed edits at the source first, then restore/remove the project copy and regenerate. Updating the source alone does not clear drift: the copy is checked against the manifest hash.
- After a partially failed run, files written before the manifest was saved can appear as conflicts. Identify them as generated output before removing them and retrying.
- Non-regular entries are skipped; a symlink on a generated destination fails with `ErrNonRegularTarget`. Inspect its ownership and destination before changing it.

Preview with the chosen generator's `--dry-run`. See [regeneration and recovery](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/workflow/regeneration.md).

## Contract branch override (v0.30)

```bash
make regenerate SOURCE_REF=release/2026.10
make regenerate SOURCE_REF="github.com/org/contracts:feature/limits github.com/org/proto:main"
GPS_SOURCE_REF=release/2026.10 make regenerate
```

CLI equivalent: repeated `--sourceRef <ref>` / `--sourceRef <repo>:<ref>`. A global ref applies to every unpinned git source; a matching per-repo ref takes precedence. Selectors use canonical `host/owner/repo` (recommended), or an unambiguous suffix; the most specific wins. **Any explicit `@ref`, including `@main`, is a pin and is never overridden.** HTTP/local paths are unaffected. CLI flags replace the entire `GPS_SOURCE_REF` environment list.

This applies to REST, gRPC, JSON Schema, CLI/queue specs, metrics/OnlineConf maps, lint overrides and custom contracts. Use explicit pins for reproducible production inputs; use unpinned git URIs when intentionally selecting branches through `SOURCE_REF`.

## REST authentication (v0.30)

For an `ogen` server with a BearerAuth scheme, set `generator_params: {auth_handler: "on", auth_scheme: bearer}`. This generates `HandleBearerAuth` / `oas.BearerAuth` instead of the default `HandleAuthHeader` / `oas.AuthHeader`; align with the actual OpenAPI security scheme.

For an `ogen_client`:

```yaml
auth_params:
  transport: header
  type: basic
```

The OpenAPI security scheme must be named **`BasicAuth`**, with `type: http`, `scheme: basic`, and referenced by `security`. OnlineConf credentials live under `/<service>/transport/rest/<name>_<version>/auth_params/{username,password}`. Both keys must exist; username must be nonempty, password may be empty. Existing `apikey` / `bearer` modes remain supported.

v0.30 fixes authenticated client self-imports and unused aliases; do not prescribe `clean_imports` as the fix for that template defect on current versions. Template `errorf` now aborts generation instead of emitting broken code.

## Metrics declaration (v0.30, opt-in)

```yaml
# project.yaml
metrics:
  path: git+ssh://git@github.com/org/contracts.git@v1.0.0#common/metrics-map.yaml
```

```yaml
# metrics-map.yaml at the source
metrics:
  - name: task_errors_total
    type: CounterVec
    labels: [reason]
    help: Tasks that failed, by reason.
```

Generates `internal/pkg/metrics/`, `make metrics-validate`, and canonical Grafana panels. No map means no metrics feature changes. Supported types: Counter, Gauge, Histogram, Summary and their Vec variants. Vec types require labels; non-Vec types reject them. Histogram buckets must increase; Summary objectives belong only to Summary types. Names must be valid Prometheus names that produce distinct Go identifiers and do not collide with internal metrics. Unknown fields fail validation.

Use generated collectors (`metrics.TaskErrorsTotal.WithLabelValues("timeout").Inc()`); registration is generated for apps with a sys transport. Do not construct service collectors elsewhere. Add `make metrics-validate` to declared CI checks if enabled. The map is read during generation, not copied into the project.

## OnlineConf accessors (v0.31)

**The v0.31.0 tagged implementation generates the `occonf` package, startup required-key checks, registry and `make onlineconf-validate` for every project**, even without `onlineconf.path`. The release summary's opt-in wording is incomplete: the path adds service keys to the generator's built-in key surface.

```yaml
# project.yaml
onlineconf:
  path: git+ssh://git@github.com/org/contracts.git@v1.0.0#common/onlineconf-key-map.yaml
```

```yaml
# onlineconf-key-map.yaml at the source
keys:
  - path: /myservice/tasks/enabled
    type: bool
    default: false
  - path: /myservice/tasks/interval
    type: duration
    default: 30s
```

Use `occonf.TasksEnabled(ctx)` and `occonf.TasksInterval(ctx)` from `internal/pkg/occonf/`, propagating errors. Service accessor names derive from path segments below the tree root, or explicit `name`. Defaults/required keys return `(value, error)`; optional keys return `(value, present, error)`. Types: string, int (int64), bool, duration, strings, struct. Declare all keys in one service tree. `required` and `default` are mutually exclusive; struct supports neither. Unknown fields, duplicate paths/identifiers and collisions with generator-owned subtrees fail generation.

Direct OnlineConf calls outside `occonf/` fail the dedicated gate, including manual sections in generated files. Use generated lifecycle/subscription helpers too. Read the generated accessor signatures for built-in keys instead of inventing paths. Required keys are checked at startup per application. The registry is `configs/onlineconf-tree.yaml`. The source map is read, not copied.

Details: [OnlineConf contracts and accessor API](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/onlineconf-keys.md).

## Custom generators and contracts (v0.31)

```yaml
generator:
  - name: limits_ts
    install: npm ci --prefix web
    cmd: 'node web/scripts/generate-limits.mjs {{ .Spec }} --out {{ .Target }}'
    lint: 'node web/scripts/lint-limits.mjs {{ .Spec }}'
contract:
  - path: git+ssh://git@github.com/org/contracts.git@v1.0.0#limits.yaml
    copy: api/contract/limits.yaml
    target: web/src/generated/limits.ts
    generator_name: limits_ts
```

`name` matches `^[a-z0-9_-]+$` and cannot collide with built-in make targets or reserved `test-env-` names. `cmd` is required; install/lint are optional. Only `{{ .Spec }}` and `{{ .Target }}` are allowed in cmd/lint; install has no template variables. Target is required when referenced. Commands must render as one line. Copy/target paths must be clean relative project paths without `..`; duplicate copy paths fail.

Generated targets: optional `install-<name>` joins `install-tools`, `generate-<name>` joins `generate`, optional `lint-<name>` joins `lint`. Generation does not depend on installation: install prerequisites explicitly when needed. Copied contracts get source/ref/commit provenance in the manifest; external generator output is not manifest-owned by the starter.

## GitHub CI and private modules

```yaml
git:
  private_repos: github.com/myorg/*
  private_repos_token_secret: GO_MODULES_TOKEN  # default GH_PAT; secret NAME, not value
github_ci:
  runs_on: [self-hosted, linux, x64]            # or label, or {group, labels}
  job_timeout_minutes: 30                     # positive; omitted means GitHub default
  checks:
    - name: lint
      run: make lint
    - name: unit-tests
      run: make unit-tests
    - name: onlineconf
      run: make onlineconf-validate
  checks_config:
    fail_fast: false
```

v0.30 adds runner/timeout/doctl version and secret selection. v0.31 adds the checks matrix: build/build-packages wait for all checks, and failed/cancelled checks block publishing. The checks list is opt-in; declare metrics/custom gates as needed. Names must be unique; each check needs a command. Use `registry_login: true` only for checks requiring registry access.

DigitalOcean only: `github_ci.doctl: install` (default) allows `doctl_version`; `doctl: image` uses runner-provided doctl and **cannot** be combined with `doctl_version` or a non-DigitalOcean registry. Checkout is consistently `actions/checkout@v4` with `persist-credentials: false`.

## Lint configuration (v0.31)

Choose one of `tools.lint_config.own: true` (project owns `configs/golangci-lint.yml`, generator retains it) or `tools.lint_config.overrides: <local-or-remote-URI>` (generated config with a declared overlay). They are mutually exclusive. Overrides merge maps, replace ordinary lists/scalars, and delete keys on null; linter/formatter enable/disable lists act as set operations. `own` does not disable the independent metrics/OnlineConf gates.

Since v0.30 lint targets no longer inject `--path-prefix=config/` or service-name build tags. Pass additional flags through `LINT_ARGS`, e.g. `make lint LINT_ARGS="--build-tags=mytag"`. `install-lint` uses a toolchain at least as new as the project's go.mod and recognizes v2 version output.

## Docker and Grafana

```yaml
docker:
  build_args:
    - IMAGE_VERSION
    - name: IMAGE_REVISION
      default: $(shell git rev-parse HEAD)
      stages: [builder, final]
  labels:
    org.opencontainers.image.version: ${IMAGE_VERSION}
    org.opencontainers.image.revision: ${IMAGE_REVISION}
grafana:
  datasources:
    - name: prometheus
      type: prometheus
      url: http://prometheus:9090
      uid: service-prometheus
  annotations:
    - name: Deployments
      tags: [deploy]
      icon_color: yellow
```

v0.30: Docker dependencies use a separate BuildKit cache layer, tokens do not remain in the builder layer, and builder apk update/upgrade is removed. Datasource uid is optional (default `ds-<lowercase name>`), 1–40 characters from `[A-Za-z0-9_-]`; effective uids must be unique.

v0.31: build args emit Dockerfile ARGs, Makefile defaults/--build-arg and dev compose args. Stage defaults to final; reserved names and undeclared/non-final label references fail validation. Labels use lowercase keys. Grafana annotations survive regeneration: unique name and nonempty tags required; optional datasource (only `grafana`), match_any, hide, enable, limit and icon_color. They are included in every generated dashboard.

## Generated-code migration (v0.31)

- `gochecknoinits` rejects `init()`, including tests. Telegram: move `cmdMaps[CmdX] = …` registrations into `func (w *Worker) customize()` and call `w.AddCommands(telegram.Cmd{…})`; move handler overrides there too. Create calls customize after generated command registration, allowing overrides by name.
- GOAT: replace `init() { testEnvInit = &testEnvInitializerImpl{} }` with `var _ = SetTestEnvInitializer(&testEnvInitializerImpl{})`. Custom setup remains in the project's manual code.
- CLI names must match `[a-zA-Z][a-zA-Z0-9_-]*`; defaults must parse as the declared flag type. Command/Subcommand now include Flags and Usage. Replace showCommandHelp with PrintCommandHelp/PrintSubcommandHelp. Review and remove obsolete `psg_handler_test.go`, preserving needed custom tests first.
- `migrate` updates config formats, not these source-code changes. Fix them manually, then run generation, build and applicable lint/tests/gates.

`make generate` now refreshes GOAT ogen-client mocks as well. `generate-jsonschema` and `clean-import` install required tools themselves; the sqlc/ActiveRecord aggregate generate recipe is fixed. GOAT projects targeting Go 1.24 can run go mod tidy. Log-level lookup respects the caller's prefix: remove workarounds that duplicated the service name.

## Sources

- [v0.30.0 release](https://github.com/Educentr/go-project-starter/releases/tag/v0.30.0)
- [v0.31.0 release](https://github.com/Educentr/go-project-starter/releases/tag/v0.31.0)
- [Generated-code migration](https://github.com/Educentr/go-project-starter/blob/v0.31.0/DEPRECATION.md)
- Tagged configuration docs: [CI](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/github-ci.md), [metrics](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/metrics-map.md), [custom generators](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/custom-generators.md), [lint](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/lint-config.md), [Docker](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/docker.md), [infrastructure](https://github.com/Educentr/go-project-starter/blob/v0.31.0/docs/configuration/infrastructure.md).
