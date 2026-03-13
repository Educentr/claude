**Diagnosis:** The error `rest 'api' is not used in any application` occurs because the `api` REST transport is defined in the `rest:` section but never referenced in any application's `transport:` list. The generator validates that every defined entity must be used in at least one application.

**The problem in your config:** Your `applications:` section only lists `sys` in the transport list for the `server` application. The `api` transport is missing.

**The fix:** Add `- name: api` to the `server` application's transport list:

```yaml
applications:
  - name: server
    transport:
      - name: api       # <-- Add this line
      - name: sys
    worker: [notifier]
```

This validation rule is enforced in `/Users/sklukin/Develop/educentr/go-project-starter/internal/pkg/config/config.go` (line 323). Every REST, gRPC, Kafka, driver, worker, and CLI entity defined in the config must appear in at least one application -- otherwise the generator rejects the config upfront, since unassigned entities would produce code that is never wired into any application binary.
