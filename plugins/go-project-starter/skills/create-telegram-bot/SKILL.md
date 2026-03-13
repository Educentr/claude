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

Key points:
- Driver `import` MUST use the project's `module_path` + `/pkg/drivers/telegram`
- `service_injection` embeds auth and payment stubs into Service
- `WithUpdatePoller()` enables long-polling (default mode)
- sys transport is required (every non-CLI app needs at least one transport)

If user also wants REST API, add ogen transport + OpenAPI spec (see create-rest-api skill).

## Step 3: Generate

```bash
which go-project-starter || go install github.com/Educentr/go-project-starter/cmd/go-project-starter@latest
go-project-starter --configDir={config_dir} --target={target_dir}
```

If fails, fix config and retry.

## Step 4: Build

```bash
cd {target_dir}
make generate
make build
```

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
