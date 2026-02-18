# Lifecycle State Machines

## Lead status

```text
NEW -> ENRICHING -> ENRICHED -> OUTREACH_PENDING -> CONTACTED -> REPLIED -> CONVERTED
                                           \-> DISQUALIFIED
```

## Outreach thread status

```text
OPEN -> CLOSED -> ARCHIVED
OPEN -> ARCHIVED
```

## Screening response status

```text
PENDING -> IN_PROGRESS -> COMPLETE
PENDING -> ESCALATED
IN_PROGRESS -> ESCALATED
```

## Call task status

```text
PENDING -> ASSIGNED -> DIALING -> COMPLETED
PENDING -> ASSIGNED -> EXPIRED
PENDING -> ASSIGNED -> DIALING -> CANCELLED
PENDING -> ASSIGNED -> DIALING -> RESTRICTED
```

## Caller allocation status

```text
ACTIVE <-> AT_RISK <-> PAUSED_LOW_DIAL_RATE
ACTIVE -> WARMUP_GRACE -> ACTIVE
ACTIVE -> RESTRICTED_FRAUD -> SUSPENDED
ACTIVE -> IDLE_NO_AVAILABLE_TASKS -> ACTIVE
```

## Project status

```text
ACTIVE -> COMPLETED
ACTIVE -> PAUSED -> ACTIVE
ACTIVE -> ARCHIVED
PAUSED -> ARCHIVED
```
