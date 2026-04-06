# Troubleshooting Guide

## Generation Errors

### `invalid config main section: Empty name`
**Fix:** Add `name` field to `main` section.

### `invalid config main section: invalid logger`
**Fix:** Set `logger` to `zerolog` or `logrus`.

### `invalid config main section: RegistryType value can be...`
**Fix:** Set `registry_type` to `github`, `digitalocean`, `aws`, or `selfhosted`.

### `duplicate rest name: X`
**Fix:** Each rest transport must have a unique name (within the same version). If you need two versions of the same API, use `version: v1` and `version: v2`.

### `rest 'X' is not used in any application`
**Fix:** Every defined rest/grpc/kafka/worker/driver/cli must appear in at least one application. Add it to an application's `transport`, `worker`, `kafka`, or `driver` list.

### `unknown transport: X in application: Y`
**Fix:** The transport name in the application doesn't match any defined rest or grpc name. Check spelling.

### `unknown driver: X in application: Y`
**Fix:** The driver name doesn't match any defined driver. Check spelling and ensure driver is defined.

### `transport must be an array` / `expected object with 'name' field, got string`
**Fix:** Transport format must be object array. Change from:
```yaml
# WRONG (old format, removed)
transport: [api, sys]
```
To:
```yaml
# CORRECT
transport:
  - name: api
  - name: sys
```

### `CLI application cannot have transports`
**Fix:** CLI apps are exclusive. An application with `cli` field cannot have `transport` or `worker`. Create a separate application.

### `Application must have at least one transport or be a CLI app`
**Fix:** Non-CLI applications need at least one transport (rest or grpc).

### `dev_stand requires 'git_install' in post_generate section`
**Fix:** When `dev_stand: true`, add `git_install` to post_generate:
```yaml
post_generate:
  - git_install
```

### `ArgenVersion required when use_active_record is true`
**Fix:** Either set `argen_version` in tools (has default v3.1.22) or remove `use_active_record: true`.

### `Invalid path: ./api.swagger.yml`
**Fix:** Path is relative to configDir. Ensure the file exists at that path. If using `--configDir`, paths are relative to that directory.

### `instantiation is only supported for ogen_client`
**Fix:** Only `ogen_client` and `buf_client` support `instantiation` field. Remove it from ogen or template transports.

### `application 'X': use_active_record can only be set to false`
**Fix:** Per-app `use_active_record` can only disable AR (set to `false`), not enable it. To enable, set globally in `main.use_active_record: true`.

### `application 'X': use_envs can only be true or omitted, false is not allowed`
**Fix:** `use_envs` is a one-way switch — set to `true` to enable ENV var mode, or omit entirely.

### `Consumer requires group`
**Fix:** Kafka consumers must have a `group` field:
```yaml
kafka:
  - name: my_consumer
    type: consumer
    group: my_consumer_group  # Required!
    client: main_kafka
    events: [...]
```

### `Queue worker requires path to contract file`
**Fix:** Workers with `generator_template: queue` must have `path`:
```yaml
worker:
  - name: task_processor
    generator_type: template
    generator_template: queue
    path: [./queues.yaml]     # Required!
```

### `Invalid schema format: expected 'schemaset.schemaid'`
**Fix:** Kafka event `schema` must be in format `jsonschema_name.schema_id`:
```yaml
kafka:
  - name: producer
    events:
      - name: user_events
        schema: models.user   # "models" = jsonschema name, "user" = schema id
```

### `Unknown jsonschema reference: X`
**Fix:** The jsonschema name in kafka `schema` field doesn't match any `jsonschema[].name`. Check spelling.

### `Custom driver requires driver_import, driver_package, driver_obj`
**Fix:** When using `driver: custom` for kafka, all three fields are required.

### `packaging.maintainer is required`
**Fix:** When using system packages (deb/rpm/apk), the `packaging` section with `maintainer` and `description` is required.

### `documentation.headers is only supported for type 'minio'`
**Fix:** The `headers` field in `documentation` only works with `type: minio`.

---

## Ogen Compilation Errors

### `undefined: oas.ErrorDefault`
**Cause:** OpenAPI spec missing ErrorDefault schema.
**Fix:** Add to your swagger file:
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
All endpoints should reference it in `default` response.

### `undefined: oas.XxxOK` or missing response types
**Cause:** Generated ogen code doesn't match spec.
**Fix:** Run `make generate-ogen` or `make generate` to regenerate.

### `cannot use &Handler{} (type *Handler) as type oas.Handler`
**Cause:** Handler doesn't implement all ogen-generated interface methods.
**Fix:** Ensure your Handler struct embeds `oas.UnimplementedHandler`:
```go
type Handler struct {
    rest.DefaultServiceHandler
    ogenDefaultError
    service.EmptyServiceToHandle
}
```
The `UnimplementedHandler` provides stubs for all methods.

### `import cycle not allowed` with ogen_client
**Cause:** `psg_auth_gen.go` for ogen_client transports contains unused self-import that `goimports` should remove.
**Fix:** Add `clean_imports` (and `tools_install` for goimports binary) to `post_generate`:
```yaml
post_generate:
  - git_install
  - tools_install
  - clean_imports
  - executable_scripts
  - call_generate
  - go_mod_tidy
```
Then regenerate. The `clean_imports` step runs goimports which removes the unused self-import.

---

## Build Errors

### `./scripts/goversioncheck.sh: Permission denied`
**Cause:** `executable_scripts` missing from `post_generate`.
**Fix:** Add `executable_scripts` to `post_generate`. If regenerating is not an option:
```bash
chmod +x scripts/*.sh scripts/githooks/*
```

### `could not import` private modules
**Fix:** Set `private_repos` in git config:
```yaml
git:
  private_repos: "github.com/myorg/*"
```
And ensure GOPRIVATE is set and git credentials are configured.

### `go: module not found` after generation
**Fix:** Run `go mod tidy` or include `go_mod_tidy` in post_generate.

### `does not contain package github.com/golangci/golangci-lint/v2/cmd/golangci-lint`
**Cause:** `golangci_version` set to a v1 version (e.g., `1.55.2`) but the generated Makefile uses v2 module path.
**Fix:** Set `golangci_version: 2.0.2` (or later v2 release) in `tools` section:
```yaml
tools:
  golangci_version: 2.0.2
```

### Package version conflicts
**Fix:** Check `tools` section versions. Update `ogen_version`, `argen_version`, etc. to compatible versions. Run `make go-get-u` to update all deps.

---

## Docker / Dev Stand Errors

### OnlineConf updater not creating TREE.cdb
**Fix:** MySQL init scripts only run on first volume creation. Drop volumes and recreate:
```bash
docker compose -f docker-compose-dev.yaml down -v
docker compose -f docker-compose-dev.yaml up
```

### Port conflicts
**Fix:** Check if ports are already in use. Each transport has its own port. Sys transport and main transport use different ports.

### Traefik not routing
**Fix:** Check docker-compose labels. Each transport gets automatic Traefik labels. Ensure entrypoints are correctly configured.

### `onlineconf-updater` exits immediately
**Fix:** Check MySQL connectivity. The updater needs MySQL to be fully initialized. Add `depends_on` with healthcheck condition.

---

## Regeneration Issues

### User code lost after regeneration
**Fix:** User code must be BELOW the disclaimer marker. Code above the marker is always overwritten. Check the marker:
```
// Code generated by projectStarter generator. DO NOT EDIT file before this message.
// If you need you can add your code after this message
```

### Changes to templates not taking effect
**Fix:** After modifying go-project-starter templates, reinstall:
```bash
cd /path/to/go-project-starter && make local-install
```
Then in your project: `make regenerate`

### `make regenerate` fails with obsolete files
**Fix:** When removing a component from config, its generated files auto-delete unless they have user code below the marker. Manually migrate code from those files, then regenerate.

### First regeneration fails with `No rule to make target 'git-init'`
**Cause:** When regenerating over files from an older go-project-starter version, obsolete files (including Makefile) are removed first, then `git_install` post-generate step tries to run `make git-init` which no longer exists.
**Fix:** Simply run go-project-starter again — the second run will succeed because the old files are already cleaned up.

### Makefile targets missing after config change
**Fix:** `make regenerate` updates the Makefile. But manual targets added below the disclaimer marker are preserved. Check that your manual targets are below the marker.

---

## Testing Errors

### GOAT tests fail with OnlineConf errors
**Fix:** GOAT test context doesn't have full OnlineConf. Never call service functions directly — always test through HTTP endpoints.

### `make test` fails after code changes
**Fix:** Rebuild test binaries first: `make build-for-test`, then `make test`.

### Test database issues
**Fix:** Check `tests/etc/onlineconf/TREE.conf` for correct DB connection settings. The test env uses its own OnlineConf.

### Coverage not collected
**Fix:** Build with coverage: `CGO_ENABLED=1 go test -cover`. GOAT tests use `GOCOVERDIR` env var.

---

## ActiveRecord Errors

### Generated repository code out of sync
**Fix:** After ANY changes to `internal/pkg/model/repository/decl/` files, run:
```bash
make generate-argen
```

### `cmpl/` directory missing or empty
**Fix:** Run `make generate-argen`. Ensure `argen_version` is set in tools config.

---

## CI/CD Errors

### GitHub Actions fails on private modules
**Fix:** Add GITHUB_TOKEN to workflow and configure `private_repos` in git section.

### Docker push fails
**Fix:** Check `docker.image_prefix` and ensure registry credentials are configured. Default prefix is `educentr`.
