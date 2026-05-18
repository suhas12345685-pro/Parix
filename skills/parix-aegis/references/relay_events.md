# Aegis Relay Event & Command Reference

## Outbound Events (Relay → Dashboard)

| Event Type         | Interval   | Payload Fields                                              |
|--------------------|------------|-------------------------------------------------------------|
| `HEALTH_SNAPSHOT`  | Every 5s   | councilState, queueDepth, uptime, governorStats, v02Stats   |
| `STATE_CHANGE`     | Real-time  | previousState, newState, timestamp                          |
| `SENSOR_EVENT`     | Real-time  | sensorType, data, timestamp                                 |
| `AUDIT_ENTRY`      | Real-time  | id, action, result, reasoning, timestamp                    |

## Inbound Commands (Dashboard → Relay)

| Command   | Effect                                    |
|-----------|-------------------------------------------|
| `pause`   | Pause the Council                         |
| `resume`  | Resume the Council                        |
| `explain` | Return explainability chain for last action |
| `flush`   | Clear the task queue                      |

## Dashboard Routes

| Route       | Page       | Key Content                              |
|-------------|------------|------------------------------------------|
| `/`         | Dashboard  | 8 stat cards + live event feed           |
| `/audit`    | Audit Trail| Expandable audit entries + "Why?" button |
| `/settings` | Settings   | Pause/resume, queue flush, rate limits   |

## Ports

| Service       | Port |
|---------------|------|
| Aegis Relay   | 8766 |
| Aegis UI      | 3000 |
