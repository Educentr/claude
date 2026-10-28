# Complete YAML Configuration Schema

Configuration reference targeting **v0.31.0**. For version boundaries, migration and examples, read [v0.30–v0.31 guidance](releases-v0.30-v0.31.md). Defaults below follow the tagged implementation (`internal/pkg/config/structs.go`), which can differ from older upstream documentation.

## A note on `path:` fields

Every `path:` field in this schema (`rest.path`, `grpc.path`, `jsonschema.path`, `jsonschema.schemas[].path`, `cli.path`, `worker.path` for queue templates) accepts both **local files** (the historical default) and **remote URIs** introduced in v0.24.0:

```
./local.yaml                                                       # local file
https://host/file.yaml[?token_env=NAME]                            # HTTPS download
git+ssh://git@host/org/repo.git@<ref>#<sub>                        # git over SSH
git+https://host/org/repo.git@<ref>?token_env=NAME#<sub>         # git over HTTPS
```

`<ref>` = branch/tag/SHA (defaults to `HEAD`); `<sub>` = file path inside the repo (required for git, single file only). `?token_env=NAME` (HTTPS only) names an env var holding the token — never write the token in YAML. RFC 3986 order: query before fragment.

See the main SKILL.md "Remote Spec Sources" section and [`docs/configuration/remote-specs.md`](https://github.com/Educentr/go-project-starter/blob/main/docs/configuration/remote-specs.md) for full grammar, auth matrix, and troubleshooting.

## main (required)

```yaml
main:
  name: string              # Required. Project name — NO hyphens (used in Go type names, OnlineConf paths, Docker images, constants)
  logger: string            # Required. "zerolog" or "logrus"
  registry_type: string     # Required. "github", "digitalocean", "aws", "selfhosted"
  author: string            # Default: "Unknown author"
  use_active_record: bool   # Default: false. Enables PostgreSQL ActiveRecord generation
  dev_stand: bool           # Default: false. Generates docker-compose-dev.yaml with OnlineConf
  skip_service_init: bool   # Default: false. Skip Service layer generation
  generate_llms_md: bool    # Default: false. Generate LLMS.md for AI coding agents
  ci: [string]              # Default: [] (generates both). Values: "github", "gitlab"
```

## git (required)

```yaml
git:
  repo: string              # Required. Git repository URL
  module_path: string       # Required. Go module path (e.g., github.com/org/repo)
  private_repos: string     # Comma-separated GOPRIVATE patterns (e.g., "github.com/myorg/*")
  private_repos_token_secret: string # GitHub Actions secret name; default GH_PAT
```

## tools (all optional)

```yaml
tools:
  golang_version: string         # Default: "1.27"
  protobuf_version: string       # Default: "1.7.0"
  ogen_version: string           # Default: "v1.20.1"
  argen_version: string          # Default: "v3.1.22". Required if use_active_record: true
  golangci_version: string       # Default: "2.1.6"
  go_jsonschema_version: string  # Default: "v0.16.0"
  runtime_version: string        # Auto-set to MinRuntimeVersion
  goat_version: string           # Auto-set to compatible minimum when omitted; preserve explicit pin
  goat_services_version: string  # Auto-set to compatible minimum when omitted; preserve explicit pin
  buf_version: string            # For gRPC buf generation
  starter_version: string        # Auto-recorded generator pin; config fallback for unidentified local builds
  lint_exclude_paths: [string]   # Regex exclusions for generated lint config
  lint_config:                  # Optional; own and overrides are mutually exclusive
    own: bool                   # Project owns configs/golangci-lint.yml
    # OR:
    overrides: string           # Local/remote YAML overlay, resolved at generation time
```

## rest[] (REST API transports)

```yaml
rest:
  - name: string              # Required. Unique transport name
    path: [string]            # Required for ogen/ogen_client. OpenAPI spec paths — local (relative to configDir) or remote URI (https://, git+ssh://, git+https://)
    generator_type: string    # Required. "ogen" | "template" | "ogen_client"
    generator_template: string # Required for "template" type. E.g., "sys"
    port: uint                # Required. HTTP port
    version: string           # Default: "v1". API version (v1, v2, etc.)
    api_prefix: string        # URL prefix for API routes
    health_check_path: string # Health check endpoint path
    public_service: bool      # Default: false. If true, no auth required
    generator_params:         # Optional. Generator-specific params
      auth_handler: string    # For ogen: "on" or "off"
      auth_scheme: string     # For ogen: "bearer" selects HandleBearerAuth/BearerAuth stub
    auth_params:              # For ogen_client only
      transport: string       # "header"
      type: string            # "apikey", "bearer", "basic" (BasicAuth scheme required)
    instantiation: string     # For ogen_client only. "static" (default) or "dynamic"
    rewrite_refs: bool        # Default: false. Rewrite cross-directory $ref (../common/foo.yml) into local sibling refs (./foo.yml) after CopySpecs. See main SKILL "Cross-Directory $ref Rewriting" section.
```

### Generator types explained

| Type | Use case | Requires |
|------|----------|----------|
| `ogen` | REST server from OpenAPI 3.0 | `path` to swagger, `ErrorDefault` schema |
| `template` | Custom template endpoints | `generator_template` (e.g., `sys`) |
| `ogen_client` | REST client for external API | `path` to swagger |

### sys template

The `sys` template generates system endpoints: `/ready`, `/live`, `/metrics` (Prometheus), `/pprof`. Every application should include a sys transport for monitoring.

### Multiple API versions

Same name, different versions create separate directories:
```yaml
rest:
  - name: api
    path: [./api/v1.yaml]
    generator_type: ogen
    port: 8080
    version: v1
  - name: api
    path: [./api/v2.yaml]
    generator_type: ogen
    port: 8080
    version: v2
```

## grpc[] (gRPC clients)

```yaml
grpc:
  - name: string              # Required. Unique service name
    path: string              # Required. Path to .proto file — local (relative to configDir) or remote URI
    short: string             # Optional. Short name for package naming
    port: uint                # Required. gRPC port
    generator_type: string    # Required. "buf_client" (only client supported now)
    buf_local_plugins: bool   # Default: false. Use local buf plugins instead of remote
    instantiation: string     # "static" (default) or "dynamic"
```

Note: `buf_server` is not yet implemented.

### Dynamic instantiation (buf_client)

In `dynamic` mode:
- Client is NOT registered at startup
- Not added to Service struct
- Not validated in `ValidateFor*`
- Creates via `NewDynamicClient(ctx, address)` — address passed at call time, no OnlineConf

## kafka[] (producers/consumers)

```yaml
kafka:
  - name: string              # Required. Unique name
    type: string              # Required. "producer" or "consumer"
    driver: string            # Default: "segmentio". Or "custom"
    driver_import: string     # Required if driver: custom
    driver_package: string    # Required if driver: custom
    driver_obj: string        # Required if driver: custom
    client: string            # Required. Client name for OnlineConf paths
    group: string             # Required for consumers. Consumer group name
    events:                   # Required. At least one event
      - name: string          # Required. Event name (= default topic name)
        schema: string        # Optional. Format: "jsonschema_name.schema_id" (e.g., "models.user")
```

### Schema reference format

The `schema` field links a kafka event to a JSON Schema definition:
- Format: `{jsonschema_name}.{schema_id}`
- The jsonschema_name must match a `jsonschema[].name`
- The schema_id must match a `jsonschema[].schemas[].id`
- If empty, events use raw `[]byte`

### Custom Kafka driver

When `driver: custom`, you provide your own Kafka driver implementation:
```yaml
kafka:
  - name: custom_producer
    type: producer
    driver: custom
    driver_import: github.com/myorg/kafka-driver
    driver_package: kafkadriver
    driver_obj: Producer
    client: confluent_kafka
    events:
      - name: orders
```

## worker[] (background workers)

```yaml
worker:
  - name: string              # Required. Unique worker name
    generator_type: string    # Required. Must be "template"
    generator_template: string # Required. "telegram", "daemon", or "queue"
    path: [string]            # Required for "queue". Path to queues.yaml — local or remote URI (since v0.24.0)
    version: string           # Optional
```

### Worker templates

| Template | Purpose | Requires |
|----------|---------|----------|
| `telegram` | Telegram bot with handlers | Driver definition for telegram |
| `daemon` | Periodic background tasks | Nothing extra |
| `queue` | Message queue processor | `path` to queues.yaml contract |

### Queue contract format (queues.yaml)

```yaml
queues:
  - name: email_send
    description: "Send email notification"
    payload:
      - name: email
        type: string
        required: true
      - name: subject
        type: string
        required: true
      - name: body
        type: string
        required: true
  - name: report_generate
    description: "Generate monthly report"
    payload:
      - name: month
        type: int
        required: true
      - name: year
        type: int
        required: true
```

## cli[] (CLI transports)

```yaml
cli:
  - name: string              # Required. Unique CLI name
    path: [string]            # Optional. Path to commands.yaml — local or remote URI (since v0.24.0)
    generator_type: string    # Required. "template"
    generator_template: string # Required. "cli"
```

### CLI commands spec (commands.yaml)

```yaml
commands:
  - name: string              # Command name
    description: string       # Help text
    flags:                    # Optional. Command-level flags
      - name: string
        type: string          # string, int, bool, float64, duration
        required: bool        # Default: false
        default: string       # Default value (parsed to correct type)
        description: string
    subcommands:              # Optional. Mutually exclusive with being a leaf command
      - name: string
        description: string
        flags: [...]          # Same flag format
```

Rules:
- Command can have `subcommands` OR be a leaf command (not both)
- Flags on leaf commands and subcommands
- Types: `string`, `int`, `bool`, `float64`, `duration`
- Names match `[a-zA-Z][a-zA-Z0-9_-]*`; typed defaults must parse as the flag type (strict since v0.31)
- Generated Command/Subcommand expose Flags and Usage; help functions are PrintCommandHelp/PrintSubcommandHelp
- Migrate/remove obsolete `psg_handler_test.go`, preserving custom tests

## jsonschema[] (JSON Schema code generation)

```yaml
jsonschema:
  - name: string              # Required. Schema set identifier
    schemas:                  # Recommended format
      - id: string            # Required. Schema ID (used in kafka references)
        path: string          # Required. Path to .json schema file — local or remote URI
        type: string          # Optional. Go type name (auto-generated from filename if empty)
    package: string           # Optional. Go package name (defaults to name)
    rewrite_refs: bool        # Default: false. Same as rest.rewrite_refs — rewrite cross-directory $ref into local sibling refs after CopySchemas. See main SKILL "Cross-Directory $ref Rewriting" section.
    # Legacy format (deprecated):
    path: [string]            # Paths to schema files — local or remote URI
```

## driver[] (external integrations)

```yaml
driver:
  - name: string              # Required. Unique driver name
    import: string            # Required. Go import path
    package: string           # Required. Go package name
    obj_name: string          # Required. Struct name (PascalCase)
    service_injection: string # Optional. Multiline: interfaces to embed in Service
```

### service_injection

Injects interface embeddings into the Service struct:
```yaml
driver:
  - name: telegram
    import: github.com/myorg/mybot/pkg/drivers/telegram
    package: telegram
    obj_name: Telegram
    service_injection: |
      telegram.BaseAuth
      telegram.UnimplementedPayment
```

## applications[] (required)

```yaml
applications:
  - name: string              # Required. App name (= container name)
    transport:                # Required for non-CLI apps. Object format only!
      - name: string          # Required. Must reference existing rest/grpc
        config:               # Optional. Per-app overrides
          instantiation: string  # "static" or "dynamic" (ogen_client/buf_client only)
          optional: bool         # Optional dependency for this app
    worker: [string]          # Worker names
    kafka:                    # Kafka references. Two formats:
      - string                # Simple: required dependency
      # OR
      - name: string          # Object: with optional flag
        optional: bool
    driver:
      - name: string          # Required. Must reference existing driver
        params: [string]      # Optional. Constructor params (e.g., ["WithUpdatePoller()"])
        optional: bool        # Optional dependency
    cli: string               # CLI transport name. EXCLUSIVE with transport/worker!
    use_active_record: bool   # Can only be false (disable per-app). Cannot be true.
    use_envs: bool            # Can only be true or omitted. Cannot be false.
    goat_tests: bool          # Enable GOAT integration tests
    goat_tests_config:        # Extended GOAT config
      enabled: bool
      binary_path: string     # Default: /tmp/{app_name}
    depends_on_docker_images: [string]  # Docker images to pre-pull
    artifacts: [string]       # Per-app override: [docker, deb, rpm, apk]
    deploy:
      volumes:
        - path: string        # Host path
          mount: string       # Container mount path
    grafana:
      datasources: [string]   # Must reference names from global grafana.datasources
```

## grafana (global)

```yaml
grafana:
  datasources:
    - name: string            # Required. Unique datasource name
      type: string            # Required. "prometheus" or "loki"
      access: string          # "proxy" or "direct"
      url: string             # Required. Datasource URL
      uid: string               # Optional. Default ds-<lowercase name>; 1–40 [A-Za-z0-9_-], globally unique
      isDefault: bool         # Only one can be default
      editable: bool          # Allow editing in Grafana UI
  annotations:
    - name: string              # Required. Unique annotation name
      tags: [string]            # Required. Nonempty list, or comma-separated string
      icon_color: string        # Default yellow
      datasource: string        # Only grafana (default)
      match_any: bool           # Default false (AND tags)
      hide: bool                # Default false
      enable: bool              # Default true
      limit: int                # Default 100
```

## artifacts

```yaml
artifacts:                    # Default: [docker]
  - docker
  - deb
  - rpm
  - apk
```

If `deb`, `rpm`, or `apk` are specified, `packaging` section is required.

## packaging (required if system packages)

```yaml
packaging:
  maintainer: string          # Required. Contact email
  description: string         # Required. Package description
  homepage: string            # Optional
  license: string             # Optional
  vendor: string              # Optional
  install_dir: string         # Default: /usr/bin
  config_dir: string          # Default: /etc/{name}
  upload:
    type: string              # "minio", "aws", or "rsync"
```

## documentation

```yaml
documentation:
  type: string                # "s3", "github_pages", or "minio"
  site_name: string           # Default: main.name
  headers: [string]           # Custom HTTP headers (minio type only)
```

## deploy

```yaml
deploy:
  log_collector:
    type: string              # "loki"
    parameters:
      loki-url: string
      loki-retries: string
      loki-timeout: string
```

## docker

```yaml
docker:
  image_prefix: string        # Default: "educentr"
  build_args:
    - IMAGE_VERSION           # Short form; stages default to [final]
    - name: IMAGE_REVISION
      default: $(shell git rev-parse HEAD)
      stages: [builder, final]
  labels:
    org.opencontainers.image.version: ${IMAGE_VERSION}
```

Names must be valid ARG identifiers and not reserved by generated Dockerfile/Makefile. Label references require an argument declared in the final stage; keys are lowercase. See [Docker guidance](releases-v0.30-v0.31.md#docker-and-grafana).

## post_generate

```yaml
post_generate:                # List of post-generation steps
  - git_install               # Initialize git repo
  - tools_install             # Install dev tools
  - clean_imports             # Run goimports
  - executable_scripts        # chmod +x scripts
  - call_generate             # Run make generate
  - go_mod_tidy               # Run go mod tidy
  - go_get_u                  # Run go get -u
```

Note: No defaults — users must explicitly specify steps. Empty array `[]` means no post-generation.

## metrics / onlineconf

```yaml
metrics:
  path: string                # Optional metrics map, local or remote URI; opt-in
onlineconf:
  path: string                # Optional service key map, local or remote URI
```

Both maps are read at generation time, not copied into the project. Metrics produces collectors, canonical panels and `metrics-validate` only when configured. In v0.31 built-in `occonf` accessors, required-key startup checks, registry and `onlineconf-validate` are generated even without a service map. See [map formats and accessor rules](releases-v0.30-v0.31.md).

## generator[] / contract[]

```yaml
generator:
  - name: string              # Required; ^[a-z0-9_-]+$, unique, not a built-in target
    install: string           # Optional tool installation command; no template variables
    cmd: string               # Required; supports {{ .Spec }} and {{ .Target }} only
    lint: string              # Optional; same variables as cmd
contract:
  - path: string              # Required; local or remote URI
    copy: string              # Required; clean relative project destination, unique
    target: string            # Optional output path; required if command uses .Target
    generator_name: string    # Required; must reference generator[].name
```

Do not overload rest/jsonschema to run an unrelated generator. See [custom generator constraints and targets](releases-v0.30-v0.31.md#custom-generators-and-contracts-v031).

## github_ci

```yaml
github_ci:
  runs_on: ubuntu-latest      # Also accepts [labels] or {group: ..., labels: [...]}
  job_timeout_minutes: 30     # Optional positive integer, applied to every job
  doctl: install              # install (default) or image (DigitalOcean only)
  doctl_version: 1.170.0      # Optional; incompatible with doctl: image
  checks:
    - name: lint              # Unique check name; each check requires run
      run: make lint
      registry_login: false  # Default false
    - name: onlineconf
      run: make onlineconf-validate
  checks_config:
    fail_fast: false          # Default false
```

Checks are opt-in. Build/build-packages wait for all declared checks. Run metrics-validate when a metrics map is configured; use onlineconf-validate for current generated projects. For runner/secret/doctl validation see [CI guidance](releases-v0.30-v0.31.md#github-ci-and-private-modules).
