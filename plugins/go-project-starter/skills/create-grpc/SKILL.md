---
name: create-grpc
description: "Create a new Go microservice with gRPC client using go-project-starter. Generates project with buf_client gRPC transport, sys metrics, Dockerfile, CI/CD. Use when user wants to create a new gRPC service project."
---

# Create gRPC Service

Interactive command to create a new Go microservice with gRPC client.

## Mandatory Steps

The task is NOT complete until ALL of these pass:
1. Interview the user to gather requirements
2. Create project.yaml config
3. Run generation successfully
4. Run build successfully (no compilation errors)

## Step 1: Interview

Ask the user:

1. **Project name** — e.g., `user-service`
2. **Git repo URL**
3. **Go module path**
4. **Proto file** — does the user have a .proto file? Where is it?
5. **gRPC port** — default 9000
6. **Short name** — short identifier for package naming (e.g., `users`)
7. **Instantiation mode** — `static` (connect at startup) or `dynamic` (connect per-request)? Default: static
8. **Also need REST API?** — many services have both
9. **Target directory**

Note: go-project-starter currently only supports gRPC **clients** (`buf_client`). Server-side gRPC (`buf_server`) is not yet implemented.

## Step 2: Create Config

```yaml
main:
  name: {project_name}
  logger: zerolog
  registry_type: github

git:
  repo: {git_repo}
  module_path: {module_path}

post_generate:
  - git_install
  - call_generate
  - go_mod_tidy

rest:
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

grpc:
  - name: {service_name}
    short: {short_name}
    path: ./{proto_file}
    port: {grpc_port}
    generator_type: buf_client
    buf_local_plugins: true

applications:
  - name: server
    transport:
      - name: sys
      - name: {service_name}
```

If dynamic instantiation:
```yaml
grpc:
  - name: {service_name}
    path: ./{proto_file}
    port: {grpc_port}
    generator_type: buf_client
    instantiation: dynamic
```

If also REST API, add ogen transport (see create-rest-api skill).

## Step 3: Generate

```bash
which go-project-starter || go install github.com/Educentr/go-project-starter/cmd/go-project-starter@latest
go-project-starter --configDir={config_dir} --target={target_dir}
```

## Step 4: Build

```bash
cd {target_dir}
make generate    # This runs buf generate for proto files
make build
```

Common issues:
- Proto file must exist at the specified path relative to configDir
- `buf` must be installed for proto generation
- If `buf_local_plugins: true`, local protoc plugins must be installed

Fix any errors and retry until build succeeds.

## Step 5: Summary

Tell the user:
- Project location
- Generated client: `pkg/grpc/{short_name}/`
- Client usage in service: available via `Service.Get{Name}Client()`
- OnlineConf paths: `/{name}/transport/grpc/{service_name}/host`, `port`
- For dynamic: use `NewDynamicClient(ctx, address)` — no OnlineConf needed
