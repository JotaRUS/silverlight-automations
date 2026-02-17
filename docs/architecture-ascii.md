# Architecture Diagram (ASCII)

```text
                           +----------------------+
                           |   External Sources   |
                           | Apollo / Sales Nav   |
                           | Enrichment Providers |
                           | Messaging Channels   |
                           | Yay.com Webhooks     |
                           +----------+-----------+
                                      |
                                      v
+-----------------------------+   +---+------------------------+
|        Express API          |-->| Validation + Auth + RBAC   |
| /api/v1 + /webhooks/yay     |   | Correlation + Error Policy |
+--------------+--------------+   +---+------------------------+
               |                      |
               | enqueue              | persist ingress/audit
               v                      v
     +---------+---------+     +------+--------------------+
     |  BullMQ Queues    |     | PostgreSQL (Prisma ORM)  |
     | (separated lanes) |     | normalized relational DB  |
     +---------+---------+     +------+--------------------+
               |                      ^
               v                      |
      +--------+---------+            |
      |  Worker Runtime  |------------+
      | call validation  |
      | enrichment flows |
      | outreach logic   |
      +--------+---------+
               |
               v
      +--------+---------+
      | Scheduler Runtime|
      | policy windows   |
      | DLQ archival     |
      +--------+---------+
               |
               v
      +--------+---------+
      | Google Sheets    |
      | operational sync |
      +------------------+
```
