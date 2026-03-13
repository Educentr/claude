# go-project-starter Plugin

Claude Code plugin for [go-project-starter](https://github.com/Educentr/go-project-starter) — генератор production-ready Go микросервисов из YAML конфигов.

## Что умеет

- Составлять правильные YAML конфиги для генератора
- Создавать новые проекты с нуля (REST, gRPC, Telegram bot)
- Добавлять компоненты в существующие проекты (Kafka, GOAT тесты, новые транспорты)
- Валидировать конфиги через реальную генерацию и сборку
- Диагностировать и исправлять ошибки генерации и компиляции

Каждая команда следует обязательному workflow: сбор требований, создание/изменение конфига, `make regenerate`, `make build` — задача не считается выполненной пока build не пройдёт.

## Установка

```bash
/plugin marketplace add Educentr/claude
/plugin install go-project-starter@educentr-marketplace
```

## Команды

### Создание проекта с нуля

| Команда | Что делает |
|---------|------------|
| `/create-rest-api` | REST API сервис: ogen сервер из OpenAPI спецификации + sys endpoint для метрик |
| `/create-telegram-bot` | Telegram бот: worker + driver + sys endpoint |
| `/create-grpc` | gRPC клиент: buf_client транспорт + sys endpoint |

### Добавление в существующий проект

| Команда | Что делает |
|---------|------------|
| `/add-rest-api` | Добавить ogen сервер (обработка запросов) или ogen_client (вызов внешнего API) |
| `/add-grpc` | Добавить gRPC клиент (static или dynamic instantiation) |
| `/add-telegram-bot` | Добавить Telegram бот worker + driver (в отдельном контейнере или в существующем) |
| `/add-kafka` | Добавить Kafka producer или consumer с опциональной типизацией через JSON Schema |
| `/add-goat-test` | Добавить GOAT интеграционные тесты с BaseTestSuite и HTTP клиентами |

### Справочный скилл

**go-project-starter** — автоматически активируется при вопросах о конфигах, генерации, ошибках. Содержит:

- Полный справочник по YAML конфигу (все секции, поля, значения по умолчанию)
- 16 правил валидации с точными сообщениями об ошибках
- 4 минимальных шаблона конфигов (REST, Telegram, CLI, Queue)
- 10 продвинутых рецептов (multi-app, kafka+jsonschema, grafana, packaging)
- Паттерны из production проекта (7 приложений, 15 транспортов, 12 воркеров)
- Troubleshooting guide по всем типам ошибок
- Полный справочник OnlineConf путей

## Структура плагина

```
plugins/go-project-starter/
├── .claude-plugin/plugin.json
├── README.md
└── skills/
    ├── go-project-starter/           # Основной справочный скилл
    │   ├── SKILL.md                  # Конфиг-справочник, валидация, паттерны
    │   └── references/
    │       ├── config-schema.md      # Полная YAML схема со всеми полями
    │       ├── recipes.md            # 10 продвинутых конфигов
    │       ├── troubleshooting.md    # Ошибки и решения
    │       └── onlineconf-paths.md   # Пути OnlineConf для runtime конфига
    ├── create-rest-api/SKILL.md      # /create-rest-api
    ├── create-telegram-bot/SKILL.md  # /create-telegram-bot
    ├── create-grpc/SKILL.md          # /create-grpc
    ├── add-rest-api/SKILL.md         # /add-rest-api
    ├── add-grpc/SKILL.md             # /add-grpc
    ├── add-telegram-bot/SKILL.md     # /add-telegram-bot
    ├── add-kafka/SKILL.md            # /add-kafka
    └── add-goat-test/SKILL.md        # /add-goat-test
```

## Поддерживаемые компоненты

| Компонент | Тип генератора | Описание |
|-----------|---------------|----------|
| REST сервер | `ogen` | Сервер из OpenAPI 3.0 спецификации |
| REST клиент | `ogen_client` | Клиент для вызова внешних API |
| Системный endpoint | `template` / `sys` | Health check, метрики, pprof |
| gRPC клиент | `buf_client` | Клиент из .proto файла |
| Kafka producer | `segmentio` | Продюсер с типизированными событиями |
| Kafka consumer | `segmentio` | Консьюмер с consumer group |
| Telegram бот | `telegram` | Worker с handler/router/commands |
| Daemon | `daemon` | Фоновые периодические задачи |
| Queue | `queue` | Обработчик очереди из контракта |
| CLI | `cli` | Командная строка из YAML спецификации |

## Правила валидации конфигов

Скилл знает все правила валидации генератора и не допускает создания невалидных конфигов:

1. Каждый определённый rest/grpc/kafka/worker/driver/cli должен быть в application
2. Transport в формате объектов: `[{name: api}]`, не строк
3. CLI приложение не может иметь transport или worker
4. Не-CLI приложение обязано иметь хотя бы один transport
5. Kafka consumer требует `group`
6. Queue worker требует `path` к контракту
7. `dev_stand: true` требует `git_install` в post_generate
8. `use_active_record: true` требует `argen_version` в tools
9. Нет дубликатов имён внутри одного типа сущностей
10. Файлы по path должны существовать
11. `instantiation` только для ogen_client и buf_client
12. OpenAPI спецификация для ogen обязана содержать `ErrorDefault` схему
13. `use_active_record` per-app может быть только `false`
14. `use_envs` может быть только `true` или не указан
15. Ссылки на grafana datasources должны существовать
16. Формат schema в kafka: `schemaset.schemaid`

## Основано на реальном опыте

Скилл создан на основе:
- Исходного кода go-project-starter (99 шаблонов, полная логика валидации)
- Production проекта с 7 приложениями, 15 REST транспортами, 12 воркерами, 3 драйверами
- Реальных паттернов: контракты в отдельной директории, mixed Docker+deb деплой, dynamic instantiation, optional dependencies
