# Troubleshooting Guide

## v0.30–v0.31 upgrade failures

- **Wrong generator still runs:** v0.31 `make regenerate` uses `GPSVERSION` via `go run`, not PATH. Use `make update-starter STARTER_VERSION=v0.31.0`; older Makefiles can bootstrap by invoking the selected version directly. First run needs module proxy/cache access.
- **Unowned destination conflict:** inspect and preserve each reported file, then move/remove conflicts and retry. Keep `.project-config/meta.yaml`; do not discard it to disable ownership checks.
- **Copied spec drift:** move needed edits to the contract source, then restore/remove the copied project file and regenerate. Merely updating the source leaves the manifest hash mismatch in place.
- **Symlink destination / `ErrNonRegularTarget`:** inspect the non-regular entry; a generated path must be a regular file. Generator skips other symlinks/sockets in the tree.
- **`undefined: cmdMaps` / init lint:** Telegram commands now register through `w.AddCommands` in `(*Worker).customize()`. GOAT setup uses `var _ = SetTestEnvInitializer(&testEnvInitializerImpl{})`. Migrate custom `init()` code; config migration does not modify it.
- **CLI validation/help failures:** use valid names `[a-zA-Z][a-zA-Z0-9_-]*` and defaults that parse as their flag type; migrate to PrintCommandHelp/PrintSubcommandHelp and inspect obsolete `psg_handler_test.go` before removing it.
- **OnlineConf gate:** use generated occonf accessors/lifecycle helpers, declare service keys through onlineconf.path and regenerate. The gate exists for every v0.31 project, even without that path.
- **Metrics gate:** declare the metric in metrics.path and use the generated collector instead of constructing one outside the metrics package.
- **`SOURCE_REF` has no effect:** any explicit `@ref`, including `@main`, is a pin and wins over overrides. Use an unpinned git URI for branch selection; plain HTTPS/local paths have no git ref.

Recovery details and feature constraints: [release guidance](releases-v0.30-v0.31.md).

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

## Remote Spec Errors (since v0.24.0)

These errors come from `path:` fields configured with a URI (`git+ssh://`, `git+https://`, `https://`) rather than a local file. See the main go-project-starter SKILL → "Remote Spec Sources" for the full grammar.

### `'git' executable not found in PATH`
**Cause:** A `git+ssh://` or `git+https://` URI is configured but `git` isn't installed.
**Fix:** Install git (`brew install git` / `apt-get install git`). Not needed if you only use local paths or `https://` direct downloads.

### `token_env variable is empty: GITHUB_TOKEN`
**Cause:** URI has `?token_env=GITHUB_TOKEN` but the env var is unset.
**Fix:**
```bash
export GITHUB_TOKEN=ghp_xxx
make regenerate
```

### `git clone failed: authentication failed` (for `git+ssh://`)
**Cause:** ssh-agent isn't running or your key isn't added.
**Fix:**
```bash
ssh-add -l                    # check loaded keys
ssh-add ~/.ssh/id_ed25519     # add a key
ssh -T git@github.com         # verify access
```

### `git clone failed: authentication failed` (for `git+https://`)
**Cause:** Token is invalid, expired, or lacks scope.
**Fix:** Regenerate token with appropriate scope (GitHub: `repo`). Re-export the env var.

### `git clone failed: repository not found`
**Cause:** URL typo or no read access.
**Fix:** Verify the URL works for plain `git clone <repo>` first.

### `subpath not found in repository: <path>`
**Cause:** The `#<sub>` fragment doesn't match any file in the cloned repo (typo, wrong ref, file moved).
**Fix:** The error message lists similar filenames as a hint. Update `#<sub>` accordingly, or pin to a `<ref>` where the file exists.

### `directory subpaths are not supported yet`
**Cause:** `#<sub>` ends with `/` (you tried to reference a directory).
**Fix:** Point to a single file. Directory recursion (e.g., for proto trees with imports) isn't supported in v1.

### `HTTP request returned non-2xx status: 404 ...`
**Cause:** Wrong URL or ref for an `https://` direct download.
**Fix:** Verify with `curl -I <url>`. Pin a stable ref (tag/SHA) instead of `main` for production.

### `SCP-style git URL not supported, rewrite as git+ssh://`
**Cause:** You used `git@github.com:org/repo.git` syntax.
**Fix:** Rewrite as `git+ssh://git@github.com/org/repo.git@<ref>#<sub>`.

### `Invalid path: ...` during config validation
**Cause:** Local path doesn't exist OR URI has a syntax error (e.g., missing `#<sub>` for git).
**Fix:** For local paths, verify the file is in configDir. For URIs, validate the grammar:
```
git+ssh://git@host/org/repo.git@<ref>#<sub>           # ref optional, sub required
git+https://host/org/repo.git@<ref>?token_env=NAME#<sub>
https://host/file.yaml?token_env=NAME
```
Query params (`?token_env=...`) must come **before** the fragment (`#<sub>`) per RFC 3986.

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

### Ogen fails to resolve `$ref: '../common/foo.yaml#/...'` (or similar `..` path)
**Cause:** Spec uses cross-directory `$ref` (`../common/`, `../shared/`) but the generator copies every `path:` file flat into `api/rest/<svc>/<ver>/`, so the relative path points nowhere. Ogen's `allow_remote: true` only resolves siblings in the same directory.
**Fix:** Enable `rewrite_refs: true` on the rest block — the generator will rewrite `../common/foo.yaml#/X` to `./foo.yaml#/X` after copy, provided `foo.yaml` is also listed in `path:`. See main SKILL "Cross-Directory $ref Rewriting" section.
```yaml
rest:
  - name: api
    rewrite_refs: true
    path:
      - git+ssh://...#orchestrator/api.swagger.yml
      - git+ssh://...#common/foo.yaml          # must be added as a sibling
```
If you previously worked around this with a `regen-cleanup.sh` (perl `s{\.\./common/...}{./...}`) — that script can be removed once the flag is on.

### Authenticated ogen_client self-import or unused alias
**Cause:** Older generator templates could emit a self-import in auth.go or an unused alias in cmd/<app>/main.go. Fixed in **v0.30.0**.
**Fix:** Check the recorded generator version, upgrade the pin if appropriate, and regenerate. Preserve `clean_imports` for normal import cleanup; it is not the current fix for this template defect.

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
**Fix:** Set a compatible v2 version (v0.31 default: `2.1.6`) in `tools` section:
```yaml
tools:
  golangci_version: 2.1.6
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
**Fix:** v0.31 `make regenerate` invokes the recorded version through `go run`. Rebuilding/installing a local binary does not change that pin. For local template development, invoke the rebuilt generator directly with `--target=<project>`. For a release upgrade, use `make update-starter STARTER_VERSION=<tag>`.

### `make regenerate` fails with obsolete files
**Fix:** When removing a component from config, its generated files auto-delete unless they have user code below the marker. Manually migrate code from those files, then regenerate.

### First regeneration fails with `No rule to make target 'git-init'`
**Cause:** When regenerating over files from an older go-project-starter version, obsolete files (including Makefile) are removed first, then `git_install` post-generate step tries to run `make git-init` which no longer exists.
**Fix:** On older output, retry the selected generator version after inspecting the partial result. In v0.31, partially written files absent from the manifest can produce conflicts: preserve user changes, identify leftover generated output, move/remove only those conflicting files, then retry. Keep meta.yaml; see the recovery reference above.

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
**Fix:** Configure `git.private_repos` and ensure the GitHub Actions secret named by `git.private_repos_token_secret` exists (default `GH_PAT`). This is separate from remote-spec `token_env`. Declare the secret name in project.yaml; do not patch generated workflows or put the secret value in YAML.

### Docker push fails
**Fix:** Check `docker.image_prefix` and ensure registry credentials are configured. Default prefix is `educentr`.
