# OnlineConf Path Reference

OnlineConf is the runtime configuration system used by generated projects. All config is read at runtime, not embedded at build time.

## v0.31 accessor boundary

Use the generated `internal/pkg/occonf/` package and `configs/onlineconf-tree.yaml` as the authoritative runtime API and path inventory. They cover the generator's keys in every project; `onlineconf.path` adds the service's own declarations. Direct OnlineConf reads outside that package fail `make onlineconf-validate`, including manual sections of generated files.

For service settings, declare keys and defaults in the source map, regenerate, and call the resulting typed accessors. Read [OnlineConf maps](releases-v0.30-v0.31.md#onlineconf-accessors-v031) for schema and return shapes. The paths below explain configuration values; they are not a reason to assemble path strings in application code. For logging, respect the caller's prefix; the v0.31 fix removes the need to duplicate the service name.

## Path Convention

```
/{serviceName}/{section}/{subsection}/{key}
```

Where `serviceName` = `main.name` from project.yaml.

## Priority System (3 Levels)

For transports, config has a 3-level priority:

1. **Default from code** (lowest)
2. **Transport-level:** `/{serviceName}/transport/rest/{transportName}_{version}/{key}`
3. **App-specific:** `/{serviceName}/transport/rest/{transportName}_{version}/{appName}/{key}` (highest)

Example: For service "myapp", transport "api_v1", app "server":
- Code default: `8080`
- Transport: `/myapp/transport/rest/api_v1/port` = `8081`
- App-specific: `/myapp/transport/rest/api_v1/server/port` = `8082` (wins)

## REST Transport Paths

```
/{service}/transport/rest/{name}_{version}/ip
/{service}/transport/rest/{name}_{version}/port
/{service}/transport/rest/{name}_{version}/timeout_read
/{service}/transport/rest/{name}_{version}/timeout_write
```

### REST Client Auth Paths (ogen_client)

```
# API Key auth
/{service}/transport/rest/{name}_{version}/auth_params/apikey

# Bearer token auth
/{service}/transport/rest/{name}_{version}/auth_params/token

# Host override
/{service}/transport/rest/{name}_{version}/host
```

### Handler Timeout Configuration

Per-handler timeouts with fallback chain:

```
# Specific handler timeout
/{service}/transport/rest/{name}_{version}/handler/{operationId}/timeout

# Transport-level default
/{service}/transport/rest/{name}_{version}/timeout_read

# Code default (30s typically)
```

## gRPC Transport Paths

```
/{service}/transport/grpc/{name}/host
/{service}/transport/grpc/{name}/port
```

For dynamic instantiation (`instantiation: dynamic`), address is passed programmatically, not via OnlineConf.

## Kafka Paths

```
# Broker configuration
/{service}/kafka/{client}/brokers                     # Comma-separated broker list
/{service}/kafka/{client}/auth_type                   # none, PLAIN, SCRAM-SHA-256, SCRAM-SHA-512
/{service}/kafka/{client}/username                    # SASL username
/{service}/kafka/{client}/password                    # SASL password

# TLS
/{service}/kafka/{client}/tls_enabled                 # 0 or 1
/{service}/kafka/{client}/tls_skip_verify             # 0 or 1 (dev only!)
/{service}/kafka/{client}/tls_ca_cert                 # PEM-encoded CA cert

# Per-event topic override
/{service}/kafka/{client}/events/{event_name}/topic   # Override topic name
```

Default topic name = event name. Override per environment:
```
# staging
/myapp/kafka/main_kafka/events/user_events/topic = "staging_user_events"
# production
/myapp/kafka/main_kafka/events/user_events/topic = "prod_user_events"
```

HTTP Basic clients additionally use `/{service}/transport/rest/{name}_{version}/auth_params/username` and `/password`. Both keys must exist, username must be nonempty, and the OpenAPI scheme must be named `BasicAuth`.

## Worker Paths

### Telegram Bot

```
/{service}/worker/telegram/{name}/token               # Bot token
/{service}/worker/telegram/{name}/webhook_url          # Webhook URL (optional)
```

### Daemon

For custom scheduling, declare service keys (e.g. tasks/enabled and tasks/interval) in the service map. Built-in daemon keys are:

```
/{service}/worker/{name}/jobs/enabled                # Names of enabled jobs; empty = disabled
/{service}/worker/{name}/batch_size                  # Per-iteration batch
/{service}/worker/{name}/max_workers                 # Concurrency
/{service}/worker/{name}/default/timeout             # Default job timeout
/{service}/worker/{name}/job/timeout                 # Override job timeout
```

### Queue

```
/{service}/worker/queue/{name}/batch_size             # Items per batch
/{service}/worker/queue/{name}/poll_interval          # Queue poll interval
```

## Database Paths (ActiveRecord)

```
/{service}/db/main/host
/{service}/db/main/port
/{service}/db/main/User
/{service}/db/main/Password
/{service}/db/main/DB
/{service}/db/main/sslmode
/{service}/db/main/max_open_conns
/{service}/db/main/max_idle_conns
```

## Environment Variable Override

For apps with `use_envs: true`, OnlineConf paths are converted to ENV vars:

```
OC_{SERVICE}__{path}__segments → value

# Double underscore (__) = path separator
# Example:
# /myapp/transport/rest/api_v1/port → OC_MYAPP__TRANSPORT__REST__API_V1__PORT
```

## Common Configuration Patterns

### Payment Providers Queue

```
/{service}/payment/providers_queue                    # JSON array: ["pike", "wata"]
```

### Feature Flags

```
/{service}/features/{feature_name}/enabled            # true/false
/{service}/features/{feature_name}/percentage          # 0-100 rollout
```

### Worker Best Practice

Declare a boolean service key with `default: false` and use its generated accessor in `GetTasks()`:

```go
// Map declares /<service>/tasks/enabled, type bool, default false.
enabled, err := occonf.TasksEnabled(ctx)
if err != nil {
    return nil, nil, err
}
if !enabled {
    return nil, nil, nil
}
```

## Test Environment

For tests:
- **Production config:** `etc/onlineconf/` (NEVER edit manually)
- **Test config:** `tests/etc/onlineconf/TREE.conf` (can edit)
- **CDB files:** Binary, generated by `onlineconf-updater` (NEVER edit)

To update test config:
```bash
make onlineconf-update-tests && make generate-test-env-api
```

For reading config in tests:
```go
// Map declares /<service>/tasks/enabled; test config seeds the declared key.
value, err := occonf.TasksEnabled(ctx)
```

## Dev Stand (docker-compose-dev.yaml)

When `dev_stand: true`, OnlineConf runs locally:
- Admin UI: `http://localhost:8888`
- Config stored in MySQL (auto-initialized from SQL templates)
- `onlineconf-updater` creates `TREE.cdb` from MySQL data
- If SQL changes: `docker compose -f docker-compose-dev.yaml down -v` to reinit
