---
name: go-project-starter
description: "Helps users compose YAML configurations for go-project-starter code generator, generate Go microservices (REST, gRPC, Kafka, Telegram, CLI, daemon, queue), set up dev_stand Docker environments with OnlineConf, troubleshoot generation and build errors, and understand config validation rules. Use this skill whenever the user mentions go-project-starter, project.yaml configs, generating Go services, ogen, buf_client, or asks about microservice scaffolding with YAML."
---

# go-project-starter

## Overview

go-project-starter is a **code generator** (not a running service). It takes YAML config + optional spec files (OpenAPI, protobuf, commands.yaml, queues.yaml) and generates a complete Go microservice project (~8000 lines, ~50 files).

**What it generates:** REST APIs (ogen), gRPC clients (buf), Kafka producers/consumers, Telegram bots, daemon workers, queue workers, CLI apps, Dockerfiles, CI/CD, Makefile, tests, Grafana dashboards, system packaging.

**Key concept — disclaimer markers:** Generated files contain a marker line. Code **above** the marker is overwritten on regeneration. Code **below** the marker is preserved. This lets users safely add custom logic that survives regeneration.

## Config Self-Validation

**Every config you create or modify MUST be validated by actually running the generator.** A config is not done until generation succeeds without errors.

### For new projects:
```bash
# 1. Create target directory with .project-config/
rm -rf /tmp/gps-test-project && mkdir -p /tmp/gps-test-project/.project-config

# 2. Copy project.yaml and spec files into .project-config/
cp project.yaml *.swagger.yml /tmp/gps-test-project/.project-config/

# 3. Run generator (reads config from .project-config/ inside target)
go-project-starter --target=/tmp/gps-test-project

# 4. If generation succeeds, try building
cd /tmp/gps-test-project && make generate && make build

# 5. If errors — fix config in .project-config/ and repeat from step 3
```

### For existing projects:
```bash
# 1. Run regenerate (uses project.yaml from .project-config/)
make regenerate

# 2. Build to verify compilation
make build

# 3. If errors — fix and repeat
```

If generation or build fails, read the error, fix the config, and retry. Do NOT report success until both generation AND build pass.

## Core Workflow

Guide users through these steps:

1. **Install:** `go install github.com/Educentr/go-project-starter/cmd/go-project-starter@latest`
2. **Init (optional):** `go-project-starter init --configDir=. --target=./myproject` — interactive wizard
3. **Write config:** Create `project.yaml` in a config directory. Add spec files (OpenAPI, .proto, etc.) alongside it.
4. **Preview:** `go-project-starter --configDir=./configs --target=./myproject --dry-run`
5. **Generate:** `go-project-starter --configDir=./configs --target=./myproject`
6. **Build:** `cd myproject && make generate && make build`
7. **Dev stand (optional):** If `dev_stand: true`, run `docker compose -f docker-compose-dev.yaml up`
8. **Iterate:** Edit config, regenerate. Code below disclaimer markers is preserved.

## Naming Rules

**`main.name` must NOT contain hyphens (or other non-Go-identifier characters).** The generator derives Go type names from `main.name` (e.g., `myservice` → `MyserviceConfig`). A name like `my-service` produces `My-ServiceConfig` which is invalid Go and breaks compilation. Use camelCase or flat lowercase: `myservice`, `myService`, `vtorchestrator`.

This field also controls: OnlineConf env var prefixes (`OC_{name}__...`), Docker image names, `constant.ServiceName`, and `.env` file references.

## Minimal Config Templates

When a user wants to create a new project, offer the matching template.

### A) REST API

```yaml
main:
  name: myservice
  logger: zerolog
  registry_type: github

git:
  repo: git@github.com:myorg/myservice.git
  module_path: github.com/myorg/myservice

rest:
  - name: api
    path: [./api.swagger.yml]
    generator_type: ogen
    port: 8080
    version: v1
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

post_generate:
  - git_install
  - tools_install
  - clean_imports
  - executable_scripts
  - call_generate
  - go_mod_tidy

applications:
  - name: server
    transport:
      - name: api
      - name: sys
```

**CRITICAL:** Always include `tools_install`, `clean_imports`, and `executable_scripts` in `post_generate`. Without `clean_imports`, ogen_client generates files with unused self-imports causing `import cycle not allowed` build errors. Without `tools_install`, ogen and linter binaries won't be available.

The OpenAPI spec MUST include an `ErrorDefault` schema:
```yaml
components:
  schemas:
    ErrorDefault:
      required: [code, error]
      properties:
        code:
          type: integer
          format: int32
        error:
          type: string
      type: object
```

### B) Telegram Bot

```yaml
main:
  name: mybot
  logger: zerolog
  registry_type: github

git:
  repo: git@github.com:myorg/mybot.git
  module_path: github.com/myorg/mybot

rest:
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

worker:
  - name: telegrambot
    generator_type: template
    generator_template: telegram

driver:
  - name: telegram
    import: github.com/myorg/mybot/pkg/drivers/telegram
    package: telegram
    obj_name: Telegram
    service_injection: |
      telegram.BaseAuth
      telegram.UnimplementedPayment

applications:
  - name: bot
    transport:
      - name: sys
    worker: [telegrambot]
    driver:
      - name: telegram
        params: [WithUpdatePoller()]
```

### C) CLI App

```yaml
main:
  name: mycli
  logger: zerolog
  registry_type: github

git:
  repo: git@github.com:myorg/mycli.git
  module_path: github.com/myorg/mycli

cli:
  - name: admin
    path: [./commands.yaml]
    generator_type: template
    generator_template: cli

applications:
  - name: admin-cli
    cli: admin
```

### D) Queue Worker

```yaml
main:
  name: myworker
  logger: zerolog
  registry_type: github

git:
  repo: git@github.com:myorg/myworker.git
  module_path: github.com/myorg/myworker

post_generate:
  - git_install
  - tools_install
  - clean_imports
  - executable_scripts
  - call_generate
  - go_mod_tidy

rest:
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

worker:
  - name: task_processor
    generator_type: template
    generator_template: queue
    path: [./queues.yaml]

applications:
  - name: server
    transport:
      - name: sys
    worker: [task_processor]
```

For advanced multi-component configs (REST + Kafka + gRPC + workers), see `references/recipes.md`.

## Config Section Quick Reference

### main (required)
| Field | Required | Values/Default |
|-------|----------|----------------|
| `name` | yes | Project name |
| `logger` | yes | `zerolog`, `logrus` |
| `registry_type` | yes | `github`, `digitalocean`, `aws`, `selfhosted` |
| `author` | no | Default: "Unknown author" |
| `use_active_record` | no | Enables PostgreSQL ActiveRecord |
| `dev_stand` | no | Generates docker-compose-dev.yaml with OnlineConf |
| `skip_service_init` | no | Skip Service layer generation |
| `generate_llms_md` | no | Generate LLMS.md for AI agents |
| `ci` | no | `["github"]`, `["gitlab"]`, or both (default: both) |

### git (required)
| Field | Required | Description |
|-------|----------|-------------|
| `repo` | yes | Git repo URL |
| `module_path` | yes | Go module path |
| `private_repos` | no | Comma-separated GOPRIVATE patterns |

### tools (all optional, have defaults)
| Field | Default |
|-------|---------|
| `golang_version` | 1.24 |
| `ogen_version` | v1.20.2 |
| `argen_version` | v3.1.22 |
| `golangci_version` | 2.0.2 |
| `protobuf_version` | 1.7.0 |
| `go_jsonschema_version` | v0.16.0 |
| `runtime_version` | auto |
| `goat_version` | auto |

### rest[]
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique name |
| `path` | for ogen/ogen_client | Paths to OpenAPI specs |
| `generator_type` | yes | `ogen`, `template`, `ogen_client` |
| `generator_template` | for template | e.g. `sys` |
| `port` | yes | HTTP port |
| `version` | yes (default v1) | API version |
| `api_prefix` | no | URL prefix |
| `health_check_path` | no | Health endpoint path |
| `public_service` | no | No auth required |
| `generator_params` | no | For ogen: `auth_handler: "on"/"off"` |
| `auth_params` | no | For ogen_client: `{transport: header, type: apikey}` |
| `instantiation` | no | `static`/`dynamic` (ogen_client only) |

### grpc[]
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique name |
| `path` | yes | Path to .proto file |
| `short` | no | Short name for package |
| `port` | yes | gRPC port |
| `generator_type` | yes | `buf_client` (only client supported) |
| `buf_local_plugins` | no | Use local buf plugins |
| `instantiation` | no | `static`/`dynamic` |

### kafka[]
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique name |
| `type` | yes | `producer` or `consumer` |
| `driver` | no | `segmentio` (default) or `custom` |
| `client` | yes | Client name for OnlineConf paths |
| `group` | for consumer | Consumer group |
| `events` | yes | List: `{name, schema?}` |

Event `schema` format: `jsonschema_name.schema_id` (e.g. `models.user`). Empty = raw `[]byte`.

### worker[]
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique name |
| `generator_type` | yes | `template` |
| `generator_template` | yes | `telegram`, `daemon`, or `queue` |
| `path` | for queue | Path to queues.yaml contract |

### cli[]
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique name |
| `path` | no | Path to commands.yaml spec |
| `generator_type` | yes | `template` |
| `generator_template` | yes | `cli` |

### driver[]
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Unique name |
| `import` | yes | Go import path |
| `package` | yes | Go package name |
| `obj_name` | yes | Struct name |
| `service_injection` | no | Code to inject into Service |

### applications[] (required)
| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | App name (= container name) |
| `transport` | for non-CLI | Object format: `[{name: x}]` |
| `worker` | no | `["worker_name"]` |
| `kafka` | no | `["kafka_name"]` or `[{name: x, optional: true}]` |
| `driver` | no | `[{name: x, params: [...]}]` |
| `cli` | exclusive | CLI name (cannot have transport/worker) |
| `goat_tests` | no | Enable GOAT integration tests |
| `use_active_record` | no | Can only be `false` (to disable per-app) |
| `use_envs` | no | Can only be `true` or omitted |
| `grafana.datasources` | no | Reference names from global `grafana` |
| `deploy.volumes` | no | `[{path, mount}]` |
| `artifacts` | no | Per-app override: `[docker, deb, rpm, apk]` |

Transport config overrides:
```yaml
transport:
  - name: external_api
    config:
      instantiation: dynamic  # override for this app
      optional: true           # optional dependency
```

### Other sections
- `post_generate`: `[git_install, tools_install, clean_imports, executable_scripts, call_generate, go_mod_tidy, go_get_u]`. **Required minimum for any project:** `git_install, tools_install, clean_imports, executable_scripts, call_generate, go_mod_tidy`. Omitting `clean_imports` causes build failures with ogen_client (import cycle errors). Omitting `tools_install` means ogen/linter binaries are missing.
- `jsonschema[]`: `{name, schemas: [{id, path, type?}], package?}`
- `grafana.datasources[]`: `{name, type: prometheus/loki, url, access: proxy/direct, isDefault, editable}`
- `artifacts`: `[docker, deb, rpm, apk]` (default: `[docker]`)
- `packaging`: Required if deb/rpm/apk: `{maintainer, description, homepage?, license?, vendor?, install_dir?, config_dir?, upload?}`
- `documentation`: `{type: s3/github_pages/minio, site_name?, headers?}`
- `deploy.log_collector`: `{type: loki, parameters: {loki-url, loki-retries, loki-timeout}}`
- `docker.image_prefix`: default `educentr`

## Validation Rules

These rules are enforced by the generator. Breaking any of them causes an error. Always follow them when composing configs:

1. **Every entity must be used.** Every defined rest, grpc, kafka, driver, worker, cli MUST appear in at least one application. Error: `"rest 'api' is not used in any application"`.
2. **Transport format is object array.** Use `transport: [{name: api}]`, NOT `transport: [api]`. The string format was removed.
3. **CLI is exclusive.** CLI apps cannot have transports or workers. Error: `"CLI application cannot have transports"`.
4. **Non-CLI apps need transport.** Every non-CLI application must have at least one transport.
5. **Consumer requires group.** Kafka consumers must have `group` field.
6. **Queue worker requires path.** `generator_template: queue` requires `path` to contract file.
7. **dev_stand requires git_install.** `dev_stand: true` needs `git_install` in `post_generate`.
8. **ActiveRecord requires ArgenVersion.** `use_active_record: true` needs `argen_version` in tools (has default).
9. **No duplicate names.** Within each entity type (rest, grpc, driver, etc.).
10. **Path files must exist.** REST/gRPC paths are resolved relative to configDir.
11. **instantiation only for clients.** Only `ogen_client` and `buf_client` support `instantiation`.
12. **ErrorDefault schema required.** ogen OpenAPI specs MUST include `ErrorDefault` schema.
13. **use_active_record per-app: only false.** Can disable AR per-app, not enable.
14. **use_envs: only true or omit.** Cannot set to `false`.
15. **Grafana datasource refs valid.** App `grafana.datasources` must reference names from global `grafana.datasources`.
16. **Kafka schema format.** Must be `schemaset.schemaid` referencing existing jsonschema.

## Dev Stand Setup

When user wants local development with OnlineConf:

1. Set `main.dev_stand: true` and include `git_install` in `post_generate`
2. Generate the project
3. Run: `docker compose -f docker-compose-dev.yaml up`
4. Available services:
   - OnlineConf Admin UI: `http://localhost:8888`
   - Traefik dashboard: `http://localhost:9080`
   - App API: `http://localhost:{port}`
   - Sys metrics: `http://localhost:{sys_port}`
5. **If SQL templates changed:** `docker compose -f docker-compose-dev.yaml down -v` then up again (MySQL init scripts only run on first start)
6. Check `onlineconf-updater` is healthy (creates `TREE.cdb` file)

## Regeneration

- `--dry-run` previews changes without writing
- Code below disclaimer marker survives regeneration
- When a component is removed from config, its generated files are auto-deleted IF there's no user code below the marker
- If user code exists below marker in a removed component's files, generation errors out — user must manually migrate their code first

## Troubleshooting Quick Reference

| Error | Fix |
|-------|-----|
| `import cycle not allowed` (ogen_client) | Add `tools_install` + `clean_imports` to `post_generate`, regenerate |
| `does not contain package golangci-lint/v2` | Set `golangci_version: 2.0.2` in tools section |
| `Permission denied` (scripts) | Add `executable_scripts` to `post_generate`, regenerate |
| `duplicate rest name: X` | Ensure unique name+version combinations |
| `rest 'X' is not used in any application` | Add to an application's transport list |
| `undefined: oas.ErrorDefault` | Add ErrorDefault schema to OpenAPI spec |
| `dev_stand requires 'git_install'` | Add `git_install` to `post_generate` |
| `ArgenVersion required` | Set `argen_version` in tools or remove `use_active_record` |
| `CLI application cannot have transports` | CLI is exclusive — separate app |
| `transport must be an array` / `expected object with 'name' field` | Use object format: `[{name: x}]` |
| `Consumer requires group` | Add `group` field to kafka consumer |
| `Queue worker requires path` | Add `path: [./queues.yaml]` to queue worker |
| OnlineConf updater not creating TREE.cdb | `docker compose -f docker-compose-dev.yaml down -v` then up |
| `instantiation is only supported for ogen_client` | Remove `instantiation` from non-client transports |

For exhaustive troubleshooting, see `references/troubleshooting.md`.

## Real-World Best Practices

These lessons come from production use of go-project-starter. They apply to any generated project.

### Generated Files Are Sacred

- **NEVER modify `*_gen.go` files.** They are overwritten on regeneration. To customize behavior: use wrapper functions, override in manual code, or modify generator templates.
- **Disclaimer markers divide generated vs manual code.** Code above the marker = regenerated. Code below = yours. All your customizations go below the marker.
- **After template changes, reinstall the tool:**
  ```bash
  cd /path/to/go-project-starter && make local-install
  ```
  Then run `make regenerate` in your project. Without reinstalling, old templates are used.

### Contract-First Development

- **OpenAPI specs (contracts) should live in a separate directory** (e.g., `../contracts/`), not inside the generated project. The generator copies them into `api/rest/` during generation.
- **After any contract change**, run `make regenerate` to copy contracts and regenerate code.
- **Ogen OpenAPI specs MUST include `ErrorDefault` schema** (see template A above). Without it, generated code won't compile.

### ActiveRecord Workflow

When `use_active_record: true`:
- Repository declarations go in `internal/pkg/model/repository/decl/`
- After ANY changes to declarations, run `make generate-argen`
- Generated code appears in `cmpl/` directories
- Use ActiveRecord methods for DB queries, avoid complex raw SQL

### Workers Best Practices

- **All new workers MUST be DISABLED by default.** Add an `enabled` flag in OnlineConf and check it in `GetTasks()`:
  ```go
  enabled, _ := onlineconf.GetBool(ctx, GetConfigPath("enabled"), false)
  if !enabled {
      return nil, nil, nil
  }
  ```
- **Daemon jobs must be short.** Process in small batches (batch size from OnlineConf). Never create long-running tasks that process everything at once.

### OnlineConf Rules

- **NEVER modify files in `etc/onlineconf/`** — production config is managed through the web UI.
- **NEVER modify `*.cdb` files** — these are binary database files generated by `onlineconf-updater`.
- **Only `tests/etc/onlineconf/TREE.conf`** can be edited for test configuration.
- For runtime config in tests, use helper functions that read from test config files.

### Testing with GOAT

- **NEVER call service functions directly from GOAT tests.** The test context doesn't have OnlineConf properly initialized. Always test through API endpoints (REST handlers).
- **Before running tests, rebuild binaries:** `make build-for-test` (GOAT test targets usually do this automatically).
- **Run specific GOAT test:** `make goat-tests-api-run TEST=TestSuiteName/TestMethodName`

### Generated Project Architecture

The generated project follows a strict layered architecture:

```
Transport Layer (internal/app/transport/)     ← REST/gRPC handlers
    ↓
Service Layer (internal/pkg/service/)         ← Business logic
    ↓
Repository Layer (internal/pkg/model/repository/)  ← Data access
    ↓
Domain Models (internal/app/ds/, internal/pkg/ds/) ← Data structures
```

- **Transport** calls **Service**, never Repository directly
- **Service** is config-agnostic, returns errors up (no logger binding)
- **Repository** uses ActiveRecord or raw queries
- **Drivers** (external integrations) implement `Runnable` interface: Init, Run, Shutdown, GracefulShutdown

### Key Make Targets in Generated Projects

| Target | When to use |
|--------|-------------|
| `make generate` | After changing OpenAPI specs or protobuf files |
| `make generate-ogen` | Regenerate only REST code from swagger |
| `make generate-argen` | After changing ActiveRecord declarations |
| `make regenerate` | After changing project.yaml (adds workers, endpoints, etc.) |
| `make build` | Build all services |
| `make build-{app}` | Build specific app (e.g., `make build-api`) |
| `make docker-{app}` | Build Docker image for app |
| `make run-{app}` | Run specific app locally |
| `make lint` | Before committing (checks diffs with main) |
| `make test` | Unit tests with race detection |
| `make goat-tests-{app}` | GOAT integration tests for app |
| `make build-for-test` | Build test binaries (before `make test`) |

## Production Patterns from Real Projects

These patterns come from a production project with 7 applications, 15 REST transports, 12 workers, and 3 drivers.

### Contracts in Separate Directory

Keep OpenAPI/proto specs outside the generated project:
```yaml
rest:
  - name: publicapi
    path: [../../contracts/public-api/xvpn.swagger.yaml]  # Outside project
    generator_type: ogen
    port: 8081
    version: v1
grpc:
  - name: xrayaccount
    path: ../../contracts/xray/service.proto  # Outside project
    generator_type: buf_client
```
The generator copies specs into `api/rest/` and `api/grpc/` during generation. After contract changes, run `make regenerate`.

### Multiple Clients for Same Spec

Same OpenAPI spec, different OnlineConf config paths:
```yaml
rest:
  - name: pike
    path: [../../contracts/bank131/bank131.swagger.yaml]
    generator_type: ogen_client
  - name: pike_fps          # Same spec, different config
    path: [../../contracts/bank131/bank131.swagger.yaml]
    generator_type: ogen_client
```
Each client gets its own OnlineConf path for host/auth, enabling different credentials.

### Mixed Deployment: Docker + deb Packages

Stateful apps use Docker, stateless edge apps use deb:
```yaml
applications:
  - name: api              # Docker (default)
    transport: [{name: api}, {name: sys}]
  - name: ipdr-traf        # deb package — runs on bare metal
    use_envs: true         # ENV vars instead of OnlineConf
    use_active_record: false
    artifacts: [deb]       # Override: no Docker
    transport: [{name: sys}, {name: client}]
```

### Driver Params with Service Callbacks

Pass service functions as driver constructor parameters:
```yaml
applications:
  - name: api
    driver:
      - name: telegram
        params:
          - WithOnSendError(service.HandleTelegramSendError)
      - name: firebase
  - name: telegram-bot
    driver:
      - name: telegram
        params:
          - WithUpdatePoller()
          - WithHiddenMessage()
          - WithOnSendError(service.HandleTelegramSendError)
```
Same driver, different params per application.

### Per-App Feature Disabling

Disable features for specific lightweight apps:
```yaml
applications:
  - name: checker
    use_envs: true              # Use ENV vars instead of OnlineConf
    use_active_record: false    # No database for this app
    depends_on_docker_images:
      - ghcr.io/org/image:latest  # Pre-pull required images
```

### Generated File Naming Convention

All generated files follow the pattern `psg_*_gen.go`:
- `psg_main_gen.go` — entry point in cmd/{app}/
- `psg_handler_gen.go` — handler base struct
- `psg_router_gen.go` — router setup
- `psg_middleware_gen.go` — middleware chain
- `psg_security_gen.go` — auth setup
- `psg_error_response_gen.go` — error handling
- `psg_service_gen.go` — service struct with DI
- `psg_daemon_gen.go` — worker daemon base
- `psg_constant_gen.go` — service constants
- `psg_base_suite_gen.go` — GOAT test base

**NEVER modify `*_gen.go` files** — they are overwritten on regeneration.

### Generated Project Directory Structure

```
project/
├── .project-config/
│   ├── project.yaml           # Generator config
│   └── meta.yaml              # Version metadata
├── cmd/{app}/
│   └── psg_main_gen.go        # Entry point per app
├── internal/
│   ├── app/
│   │   ├── constant/          # Service constants
│   │   ├── transport/
│   │   │   ├── rest/{name}/v1/
│   │   │   │   ├── psg_*_gen.go      # Generated infrastructure
│   │   │   │   ├── handler/
│   │   │   │   │   ├── psg_handler_gen.go  # Generated struct
│   │   │   │   │   └── *.go               # Your handlers
│   │   │   │   └── *.go                   # Your middleware
│   │   │   └── grpc/{name}/
│   │   └── worker/{name}/
│   │       ├── psg_daemon_gen.go     # Generated daemon base
│   │       ├── worker.go             # Your GetTasks()
│   │       └── job.go                # Your task logic
│   └── pkg/
│       ├── service/
│       │   ├── psg_service_gen.go    # Generated service struct
│       │   └── *.go                  # Your business logic
│       └── model/repository/         # ActiveRecord models
├── pkg/
│   ├── rest/{name}/v1/              # Generated ogen code
│   ├── grpc/{name}/                 # Generated protobuf code
│   ├── schema/{name}/               # Generated JSON Schema code
│   ├── drivers/{name}/              # Driver implementations
│   └── app/                         # Runtime libraries
├── api/
│   ├── rest/{name}/v1/*.swagger.yaml
│   ├── grpc/{name}/*.proto
│   └── schema/{name}/*.schema.json
├── tests/{app}/
│   ├── psg_*_gen.go                 # Generated test infrastructure
│   ├── *_test.go                    # Your test suites
│   └── fixtures.go, factories.go    # Test helpers
├── configs/
│   ├── transport/rest/{name}/ogen_*.yaml
│   ├── transport/grpc/{name}/buf.gen.yaml
│   └── grafana/                     # Dashboard configs
├── etc/
│   ├── onlineconf/                  # Runtime config (DO NOT edit)
│   └── database/postgres/           # DB migrations
├── docker-compose-{app}.yaml        # Per-app compose files
├── Dockerfile-{app}                 # Per-app Dockerfiles
└── Makefile                         # Generated + manual targets
```

### Worker Implementation Pattern

Generated daemon provides the framework, you implement the logic:

```go
// worker.go (your code)
func (w *Worker) GetTasks(ctx context.Context, lastJobState any) ([]daemon.ITask, any, error) {
    // 1. Check enabled flag
    enabled, _ := onlineconf.GetBool(ctx, GetConfigPath("enabled"), false)
    if !enabled {
        return nil, lastJobState, nil
    }
    // 2. Check interval
    interval, _ := onlineconf.GetDuration(ctx, GetConfigPath("interval"), 30*time.Second)
    if time.Since(state.LastRunTime) < interval {
        return nil, state, nil
    }
    // 3. Return tasks
    return []daemon.ITask{&MyTask{}}, state, nil
}

// job.go (your code)
type MyTask struct{}
func (t *MyTask) GetID(_ context.Context) string { return "my_task" }
func (t *MyTask) Do(ctx context.Context, srv ds.IService) error {
    // Business logic here
    return nil
}
```

### GOAT Integration Tests Pattern

Generated test infrastructure provides suite + HTTP clients:

```go
// your_test.go
type MyTestSuite struct {
    tests.BaseTestSuite  // Generated: ctx, env, flow, HTTP clients, mocks
}

func TestMyTestSuite(t *testing.T) {
    suite.Run(t, new(MyTestSuite))
}

func (s *MyTestSuite) TestSomething() {
    // Use generated HTTP clients
    resp := s.publicapiClient.Post("/api/v1/endpoint", body)
    s.Equal(200, resp.StatusCode)
    // NEVER call service functions directly — always through HTTP
}
```

## Reference Files

Read these when you need deeper detail:

- **`references/config-schema.md`** — Full YAML schema with every field, type, default, and valid values. Read when user asks about obscure options.
- **`references/recipes.md`** — 10 advanced config patterns (multi-app, kafka+jsonschema, grafana, packaging, etc.). Read for complex architecture requests.
- **`references/troubleshooting.md`** — Exhaustive error guide with exact messages and solutions. Read when user hits errors not in the quick reference above.
- **`references/onlineconf-paths.md`** — Complete OnlineConf runtime config path reference. Read when user asks about runtime configuration.
