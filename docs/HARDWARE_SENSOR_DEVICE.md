# Hardware Sensor Device — Design Spec

Status: **Draft — in development on branch `feature/hardware-sensor-device`**
Last updated: 2026-04-18

---

## 1. Hardware overview (BOM)

| Role | Component | Notes |
|------|-----------|-------|
| Controller | **LilyGO T-SIM7670G-S3** | ESP32-S3 + built-in LTE (SIM7670G). No WiFi dependency. |
| People counter | **VL53L1X ToF sensor** | Directional counting via two ROIs (In / Out). |
| User feedback | **3× Arcade LED buttons** | 🔴 Red / 🟡 Yellow / 🟢 Green (satisfaction). |
| LED control | **2N2222 NPN transistors @ 5V** | ESP32 GPIO → transistor base → LED+ button ring. Remote control by server. |

**Connectivity:** LTE (cellular). No LAN/WiFi required at the restroom.
**Power:** wall adapter (5V 2A recommended). Optional battery fallback TBD.

---

## 2. What the device does

1. **Counts people entering / leaving** the restroom using the ToF sensor's
   two ROIs (Region Of Interest) to detect direction of crossing.
2. **Collects satisfaction feedback** — user taps one of the 3 arcade buttons
   on the way out:
   - 🟢 Green = good
   - 🟡 Yellow = ok
   - 🔴 Red   = bad (creates an incident automatically)
3. **Displays status** via the LED rings of the 3 buttons. Lit colors can be
   driven locally (e.g. "thanks!" flash after a press) or remotely by the
   admin (e.g. force red = "needs attention", green = "just cleaned").
4. **Reports telemetry** — periodic heartbeat with signal strength,
   uptime, firmware version, cumulative counts.

---

## 3. Data model additions

> All changes are **additive** to the existing schema. The existing `Device`
> row (used today for tablets) is reused. We add a `hardwareType` field and
> new related tables for events & telemetry.

```prisma
enum DeviceHardwareType {
  TABLET        // current kiosk
  SENSOR_BUTTON // this new device
}

model Device {
  // existing fields …
  hardwareType   DeviceHardwareType @default(TABLET)
  firmwareVer    String?
  lastSignalDbm  Int?     // LTE RSSI
  authToken      String?  // per-device shared secret for /device-api auth
}

model DeviceEvent {
  id         String   @id @default(uuid())
  deviceId   String
  type       String   // "enter" | "exit" | "feedback" | "button_press"
  payload    Json     // { color?: "red"|"yellow"|"green", count?: n }
  occurredAt DateTime @default(now())
  device     Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  @@index([deviceId, occurredAt])
  @@map("device_events")
}

model DeviceTelemetry {
  id            String   @id @default(uuid())
  deviceId      String
  rssi          Int?
  uptimeSeconds Int?
  peopleIn      Int?     // cumulative since boot
  peopleOut     Int?
  recordedAt    DateTime @default(now())
  device        Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  @@index([deviceId, recordedAt])
  @@map("device_telemetry")
}

model DeviceCommand {
  id         String   @id @default(uuid())
  deviceId   String
  type       String   // "set_leds"
  payload    Json     // { red:bool, yellow:bool, green:bool, blinkMs?:n }
  issuedAt   DateTime @default(now())
  ackedAt    DateTime?
  device     Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  @@index([deviceId, ackedAt])
  @@map("device_commands")
}
```

---

## 4. HTTP API (device ↔ server)

Base: `https://toiletcleanpro.duckdns.org/api/device-api/:deviceCode`
Auth: `Authorization: Bearer <device.authToken>` header.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/events` | Report one or more events: counts / button presses. Body: `{ events: [{ type, payload, occurredAt }] }`. |
| `POST` | `/telemetry` | Periodic heartbeat + counters + signal. |
| `GET`  | `/commands` | Poll for pending LED commands. Returns an array; empty → nothing to do. |
| `POST` | `/commands/:id/ack` | Ack a command after execution. |
| `GET`  | `/config` | Fetch ROI / thresholds / heartbeat interval configured in admin. |

- **Offline resilience:** firmware queues events in local SPIFFS if the LTE
  connection fails and flushes on reconnect.
- **Clock skew:** each event carries its own `occurredAt`; server trusts device
  time but stores `receivedAt` server-side as well.

---

## 5. Admin UI additions

1. **Settings → new device type picker** when registering a device:
   `TABLET` vs `SENSOR_BUTTON`. For SENSOR_BUTTON we generate a fresh
   `authToken` and show it + the device URL so it can be flashed into the
   firmware.
2. **Dashboard →** per-building "live occupancy" card (people currently
   inside = cumulative in − cumulative out, clamped ≥0, reset daily).
3. **Dashboard →** "Feedback sentiment" card
   (🟢/🟡/🔴 counts for the selected window).
4. **Device detail page:** chart of in/out over time, feedback history,
   last telemetry, **Remote LED control** (3 color toggles + "blink" test).
5. **Incident auto-creation rule:** a 🔴 red press creates an incident of
   type `fault_report` on the device's restroom (configurable per org).

---

## 6. Firmware sketch (on-device)

Repo layout (new):

```
firmware/
  sensor-button/
    platformio.ini
    src/
      main.cpp           // Arduino-style setup/loop
      Tof.cpp/.h         // VL53L1X ROI-based directional counter
      Buttons.cpp/.h     // debounce 3 buttons
      Leds.cpp/.h        // GPIO → 2N2222 → LEDs (with blink)
      Net.cpp/.h         // LTE init + HTTPS to /device-api
      EventQueue.cpp/.h  // SPIFFS-backed offline queue
```

Dependencies via PlatformIO: `sparkfun/SparkFun VL53L1X`, `TinyGSM`,
`ArduinoJson`, `PubSubClient` (only if we later choose MQTT), `LittleFS`.

---

## 7. Rollout plan

Phase 1 — **backend + admin skeleton** (this branch):
- [ ] Prisma schema additions (enum + 3 tables + Device fields).
- [ ] `DeviceApi` module with the 5 endpoints above + bearer auth.
- [ ] Admin: device registration flow with hardware type + token display.
- [ ] Admin: per-device page stub (read-only list of recent events / telemetry).

Phase 2 — **core features**:
- [ ] Admin: remote LED control (issue command → device polls/acks).
- [ ] Dashboard cards: live occupancy + feedback sentiment.
- [ ] Incident auto-creation on red press.

Phase 3 — **firmware**:
- [ ] PlatformIO project with drivers.
- [ ] Offline queue + retry.
- [ ] Field tests & signal logging.

Phase 4 — **polish**:
- [ ] ROI calibration tool in admin.
- [ ] Alerts when a device goes offline > N min.
- [ ] Per-org rules engine (e.g. "3 reds in 15 min → incident").
