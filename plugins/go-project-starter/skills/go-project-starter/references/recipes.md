# Advanced Configuration Recipes

## 1. Multi-App Project (REST API + Bot + Background Worker)

```yaml
main:
  name: myplatform
  logger: zerolog
  registry_type: github

git:
  repo: git@github.com:myorg/myplatform.git
  module_path: github.com/myorg/myplatform

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

worker:
  - name: telegrambot
    generator_type: template
    generator_template: telegram
  - name: status_updater
    generator_type: template
    generator_template: daemon

driver:
  - name: telegram
    import: github.com/myorg/myplatform/pkg/drivers/telegram
    package: telegram
    obj_name: Telegram
    service_injection: |
      telegram.BaseAuth
      telegram.UnimplementedPayment

post_generate:
  - git_install
  - call_generate
  - go_mod_tidy

applications:
  # REST API service
  - name: api
    transport:
      - name: api
      - name: sys
  # Telegram bot in separate container
  - name: telegram-bot
    transport:
      - name: sys
    worker: [telegrambot]
    driver:
      - name: telegram
        params: [WithUpdatePoller()]
  # Background daemon in separate container
  - name: workers
    transport:
      - name: sys
    worker: [status_updater]
```

## 2. REST Server + REST Client (External API)

```yaml
rest:
  # Your server
  - name: api
    path: [./api.swagger.yml]
    generator_type: ogen
    port: 8080
    version: v1
  # External API client
  - name: payment_api
    path: [./payment.swagger.yml]
    generator_type: ogen_client
    port: 443
    version: v1
    auth_params:
      transport: header
      type: apikey
  # Dynamic client (address resolved at runtime)
  - name: partner_api
    path: [./partner.swagger.yml]
    generator_type: ogen_client
    port: 443
    version: v1
    instantiation: dynamic
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

applications:
  - name: server
    transport:
      - name: api
      - name: sys
      - name: payment_api
      - name: partner_api
        config:
          instantiation: dynamic  # Can override at app level
```

OnlineConf paths for auth:
- apikey: `{service}/transport/rest/{name}_{version}/auth_params/apikey`
- bearer: `{service}/transport/rest/{name}_{version}/auth_params/token`

## 3. Kafka with Typed Messages (JSON Schema)

```yaml
jsonschema:
  - name: models
    schemas:
      - id: user
        path: ./schemas/user.schema.json
      - id: order
        path: ./schemas/order.schema.json
        type: OrderEvent  # Explicit Go type name

kafka:
  - name: user_producer
    type: producer
    driver: segmentio
    client: main_kafka
    events:
      - name: user_created
        schema: models.user    # References jsonschema "models", schema id "user"
      - name: user_updated
        schema: models.user
  - name: order_consumer
    type: consumer
    driver: segmentio
    client: main_kafka
    group: order_processing
    events:
      - name: order_placed
        schema: models.order
      - name: raw_event         # No schema = raw []byte

rest:
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

applications:
  - name: api
    transport:
      - name: sys
    kafka:
      - user_producer
      - order_consumer
```

## 4. gRPC Client

```yaml
grpc:
  # Static client — connects at startup
  - name: UserService
    short: user
    path: ./proto/user.proto
    port: 9000
    generator_type: buf_client
    buf_local_plugins: true

  # Dynamic client — connects per-request
  - name: PartnerService
    short: partner
    path: ./proto/partner.proto
    port: 9001
    generator_type: buf_client
    instantiation: dynamic

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

applications:
  - name: server
    transport:
      - name: api
      - name: sys
      - name: UserService
      - name: PartnerService
```

## 5. Telegram Bot + REST API (Combined)

Single application with both REST API and Telegram bot:

```yaml
rest:
  - name: api
    path: [./api.swagger.yml]
    generator_type: ogen
    port: 8080
    version: v1
  - name: webhooks
    path: [./webhooks.swagger.yml]
    generator_type: ogen
    port: 8081
    version: v1
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

applications:
  # Everything in one container
  - name: server
    transport:
      - name: api
      - name: webhooks
      - name: sys
    worker: [telegrambot]
    driver:
      - name: telegram
        params: [WithUpdatePoller()]
```

## 6. Queue Worker with Contract

```yaml
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
    path: [./queues.yaml]     # Contract file

applications:
  - name: worker
    transport:
      - name: sys
    worker: [task_processor]
```

queues.yaml:
```yaml
queues:
  - name: email_send
    description: "Send email notification"
    payload:
      - name: to
        type: string
        required: true
      - name: subject
        type: string
        required: true
      - name: body
        type: string
  - name: report_generate
    description: "Generate report"
    payload:
      - name: report_id
        type: int
        required: true
```

## 7. System Packaging (deb/rpm)

```yaml
main:
  name: myservice
  logger: zerolog
  registry_type: selfhosted

artifacts:
  - docker
  - deb
  - rpm

packaging:
  maintainer: "admin@example.com"
  description: "My production service"
  homepage: "https://example.com"
  license: "MIT"
  vendor: "MyOrg"
  install_dir: /usr/bin           # Default
  config_dir: /etc/myservice      # Default: /etc/{name}
  upload:
    type: minio                   # minio, aws, or rsync

# ... rest of config
```

## 8. Grafana Monitoring

```yaml
grafana:
  datasources:
    - name: Prometheus
      type: prometheus
      access: proxy
      url: http://prometheus:9090
      isDefault: true
      editable: false
    - name: Loki
      type: loki
      access: proxy
      url: http://loki:3100
      isDefault: false
      editable: false

applications:
  - name: api
    transport:
      - name: api
      - name: sys
    grafana:
      datasources:
        - Prometheus          # Reference by name
        - Loki
```

Generates: Grafana dashboards, provisioning configs for datasources and dashboards.

## 9. Dev Stand with Full Stack

```yaml
main:
  name: myservice
  logger: zerolog
  registry_type: github
  dev_stand: true                 # Enable dev environment
  use_active_record: true         # PostgreSQL ORM

git:
  repo: git@github.com:myorg/myservice.git
  module_path: github.com/myorg/myservice

tools:
  argen_version: v3.1.22          # Required for ActiveRecord

deploy:
  log_collector:
    type: loki
    parameters:
      loki-url: "https://loki.example.com/loki/api/v1/push"
      loki-retries: "2"
      loki-timeout: "4s"

grafana:
  datasources:
    - name: Prometheus
      type: prometheus
      access: proxy
      url: http://prometheus:9090
      isDefault: true

post_generate:
  - git_install                   # Required for dev_stand!
  - call_generate
  - go_mod_tidy

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

applications:
  - name: server
    transport:
      - name: api
      - name: sys
    grafana:
      datasources: [Prometheus]
```

Dev stand provides:
- docker-compose-dev.yaml
- OnlineConf server + admin UI (:8888)
- Traefik reverse proxy (:9080)
- Prometheus, Loki (if configured)
- PostgreSQL (if ActiveRecord)

## 10. Optional Dependencies

For services that may or may not be available:

```yaml
rest:
  - name: api
    path: [./api.swagger.yml]
    generator_type: ogen
    port: 8080
    version: v1
  - name: external_api
    path: [./external.swagger.yml]
    generator_type: ogen_client
    port: 443
    version: v1
  - name: sys
    port: 9090
    version: v1
    generator_type: template
    generator_template: sys

grpc:
  - name: PartnerService
    path: ./partner.proto
    port: 9000
    generator_type: buf_client

kafka:
  - name: analytics_producer
    type: producer
    client: analytics
    events:
      - name: page_view

applications:
  - name: server
    transport:
      - name: api
      - name: sys
      - name: external_api
        config:
          optional: true          # Won't fail if unavailable
      - name: PartnerService
        config:
          optional: true
    kafka:
      - name: analytics_producer
        optional: true            # Object format for optional kafka
    driver:
      - name: redis
        optional: true
```

Optional dependencies don't cause startup failures if the external service is unavailable.
