---
name: create-telegram-bot
description: "Create a new Telegram bot Go microservice from scratch using go-project-starter. Generates complete project with Telegram worker, driver, sys metrics, Dockerfile, CI/CD. Use when user wants to create a new Telegram bot project."
---

# Create Telegram Bot Service

Interactive command to create a new Telegram bot microservice from scratch.

## Mandatory Steps

The task is NOT complete until ALL of these pass:
1. Interview the user to gather requirements
2. Create project.yaml config
3. Run generation successfully
4. Run build successfully (no compilation errors)

## Step 1: Interview

Ask the user (skip questions where user already provided info):

1. **Project name** — e.g., `my-bot`
2. **Git repo URL** — e.g., `git@github.com:myorg/my-bot.git`
3. **Go module path** — e.g., `github.com/myorg/my-bot`
4. **Also need REST API?** — some bots also serve a REST API (webhooks, admin panel)
5. **Target directory** — where to generate
6. **Dev stand** — need local Docker with OnlineConf? (default: no)

## Step 2: Create Config

### Bot-only config

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

worker:
  - name: telegrambot
    generator_type: template
    generator_template: telegram

driver:
  - name: telegram
    import: {module_path}/pkg/drivers/telegram
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

### Bot + REST API config

If user also wants REST API, add ogen transport and create an OpenAPI spec:

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
  - name: api
    path: [./api/api.swagger.yml]
    generator_type: ogen
    port: 8080
    version: v1
    generator_params:
      auth_handler: "off"
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
    import: {module_path}/pkg/drivers/telegram
    package: telegram
    obj_name: Telegram
    service_injection: |
      telegram.BaseAuth
      telegram.UnimplementedPayment

applications:
  - name: bot
    transport:
      - name: api
      - name: sys
    worker: [telegrambot]
    driver:
      - name: telegram
        params: [WithUpdatePoller()]
```

Create a minimal OpenAPI spec at `api/api.swagger.yml` (**ErrorDefault with `code` and `error` fields is mandatory**):

```yaml
openapi: "3.0.0"
info:
  title: "{project_name} API"
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: healthCheck
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
        default:
          description: Error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorDefault'
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

### Dev stand

If user wants dev stand, add `dev_stand: true` to `main` section:
```yaml
main:
  name: {project_name}
  logger: zerolog
  registry_type: github
  dev_stand: true
```
Note: `dev_stand: true` requires `git_install` in `post_generate` (already included in configs above).

### Key points
- Driver `import` MUST use the project's `module_path` + `/pkg/drivers/telegram`
- `service_injection` embeds auth and payment stubs into Service
- `WithUpdatePoller()` enables long-polling (default mode)
- sys transport is required (every non-CLI app needs at least one transport)
- OpenAPI spec MUST include `ErrorDefault` schema with `code` (integer) and `error` (string) fields — the generated handler depends on these exact fields

## Step 3: Generate

```bash
which go-project-starter || go install github.com/Educentr/go-project-starter/cmd/go-project-starter@latest
go-project-starter --configDir={config_dir} --target={target_dir}
```

If fails, fix config and retry.

## Step 4: Build

```bash
cd {target_dir}
chmod +x scripts/*.sh scripts/githooks/*
make generate
make build
```

**Important:** Generated scripts may lack execute permissions — always `chmod +x` before first build.

Fix any errors and retry until build succeeds.

## Step 5: Summary

Tell the user:
- Project location
- Bot handler: `internal/app/worker/telegrambot/handler/handler.go`
- Bot router: `internal/app/worker/telegrambot/router.go`
- Driver: `pkg/drivers/telegram/` (generated with full Telegram API support)
- OnlineConf path for token: `/{name}/worker/telegram/telegrambot/token`
- How to run: `make run-bot`
- Workers are DISABLED by default — set enabled=true in OnlineConf
