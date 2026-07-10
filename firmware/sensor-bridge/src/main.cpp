// ToiletMon sensor bridge — reads an HLK-LD2450 24GHz radar over UART and
// reports restroom presence to the ToiletMon server over WiFi.
//
// Provisioning: on first boot (or after holding BOOT for 5s) the board opens
// a captive-portal hotspot "ToiletMon-Setup". The installer connects from a
// phone, picks the WiFi network, and pastes the device code (SENS-<restroomId>)
// copied from the /flash page on the ToiletMon site. The server self-registers
// SENS-* codes the same way it does ROOM-* kiosk codes.

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>

// ── Pins ─────────────────────────────────────────────────────────────────────
constexpr int RADAR_RX_PIN = 15; // LD2450 TX -> board GPIO15
constexpr int RADAR_TX_PIN = 16; // LD2450 RX -> board GPIO16
constexpr int BOOT_BTN_PIN = 0;  // hold 5s to wipe provisioning

// ── Radar protocol (LD2450 data frame) ───────────────────────────────────────
// Header AA FF 03 00, then 3 targets x 8 bytes, tail 55 CC. 256000 baud 8N1.
constexpr uint32_t RADAR_BAUD = 256000;
constexpr size_t FRAME_LEN = 30;
constexpr uint8_t FRAME_HEADER[4] = {0xAA, 0xFF, 0x03, 0x00};

// ── Presence tuning ──────────────────────────────────────────────────────────
// Admin-configurable per device: the server piggybacks {occupiedAfterMs,
// emptyAfterMs} on every report response; we apply + persist them.
uint32_t occupiedAfterMs = 1000;               // continuous presence before "occupied"
uint32_t emptyAfterMs = 15000;                 // continuous absence before "empty"
constexpr uint32_t HEARTBEAT_EVERY_MS = 60000; // status ping to the server

constexpr const char *SETUP_AP_NAME = "ToiletMon-Setup";
constexpr const char *DEFAULT_SERVER = "https://cleanco.ai"; // primary domain (duckdns still works)
constexpr const char *FIRMWARE_VERSION = "1.0.2";

Preferences prefs;
String wifiSsid, wifiPass, deviceCode, serverUrl;

bool portalMode = false;
WebServer *portalServer = nullptr;
DNSServer *portalDns = nullptr;

// Radar state
uint8_t frameBuf[FRAME_LEN];
size_t frameFill = 0;
int lastTargetCount = 0;
uint32_t lastPresentAt = 0;
uint32_t lastAbsentAt = 0;
uint32_t lastFrameAt = 0;

// Presence state machine
bool occupied = false;
uint32_t occupiedSince = 0;
uint32_t lastHeartbeatAt = 0;
bool pendingStart = false;
bool pendingEnd = false;
uint32_t pendingEndDurationSec = 0;

uint32_t bootBtnDownAt = 0;

// ── Provisioning storage ─────────────────────────────────────────────────────

void loadConfig() {
  prefs.begin("toiletmon", false);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  deviceCode = prefs.getString("deviceCode", "");
  serverUrl = prefs.getString("serverUrl", DEFAULT_SERVER);
  occupiedAfterMs = prefs.getULong("occMs", occupiedAfterMs);
  emptyAfterMs = prefs.getULong("empMs", emptyAfterMs);
}

// Server report responses carry {"config":{"occupiedAfterMs":…,"emptyAfterMs":…}}
// when an admin tuned this sensor. Tiny hand parser — two known integer keys.
void applyServerConfig(const String &body) {
  auto readInt = [&](const char *key) -> long {
    int i = body.indexOf(key);
    if (i < 0) return -1;
    i = body.indexOf(':', i);
    return i < 0 ? -1 : body.substring(i + 1).toInt();
  };
  long occ = readInt("\"occupiedAfterMs\"");
  long emp = readInt("\"emptyAfterMs\"");
  bool changed = false;
  if (occ >= 500 && occ <= 60000 && (uint32_t)occ != occupiedAfterMs) {
    occupiedAfterMs = occ;
    prefs.putULong("occMs", occupiedAfterMs);
    changed = true;
  }
  if (emp >= 3000 && emp <= 600000 && (uint32_t)emp != emptyAfterMs) {
    emptyAfterMs = emp;
    prefs.putULong("empMs", emptyAfterMs);
    changed = true;
  }
  if (changed) {
    Serial.printf("[config] tuned from server: occupied=%lums empty=%lums\n",
                  (unsigned long)occupiedAfterMs, (unsigned long)emptyAfterMs);
  }
}

void wipeAndReboot() {
  Serial.println("[setup] wiping provisioning, rebooting into portal");
  prefs.clear();
  delay(300);
  ESP.restart();
}

// ── Captive portal ───────────────────────────────────────────────────────────

String htmlEscape(const String &s) {
  String out = s;
  out.replace("&", "&amp;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  out.replace("\"", "&quot;");
  return out;
}

String portalPage() {
  // Networks are scanned on portal start; rescan on each page load is slow.
  static String options;
  if (options.length() == 0) {
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n && i < 20; i++) {
      String ssid = htmlEscape(WiFi.SSID(i));
      options += "<option value=\"" + ssid + "\">" + ssid +
                 " (" + String(WiFi.RSSI(i)) + "dBm)</option>";
    }
  }

  String page =
      "<!DOCTYPE html><html dir='rtl' lang='he'><head><meta charset='utf-8'>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>ToiletMon Sensor</title><style>"
      "body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}"
      "h1{font-size:1.3rem}form{max-width:420px}"
      "label{display:block;margin:14px 0 4px;font-size:.9rem;color:#94a3b8}"
      "input,select{width:100%;padding:10px;border-radius:8px;border:1px solid #334155;"
      "background:#1e293b;color:#e2e8f0;font-size:1rem;box-sizing:border-box}"
      "button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:8px;"
      "background:#0ea5e9;color:#fff;font-size:1.05rem;font-weight:700}"
      "</style></head><body><h1>🚻 הגדרת חיישן ToiletMon</h1>"
      "<form method='POST' action='/save'>"
      "<label>רשת WiFi</label><select name='ssid'>" + options + "</select>"
      "<label>סיסמת הרשת</label><input name='pass' type='text' autocomplete='off'>"
      "<label>קוד מכשיר (SENS-... מדף ההתקנה באתר)</label>"
      "<input name='code' value='" + htmlEscape(deviceCode) + "' placeholder='SENS-...'>"
      "<label>כתובת שרת</label><input name='server' value='" + htmlEscape(serverUrl) + "'>"
      "<button type='submit'>שמור והתחבר</button></form></body></html>";
  return page;
}

void startPortal() {
  portalMode = true;
  WiFi.mode(WIFI_AP_STA); // STA up so scanNetworks works
  WiFi.softAP(SETUP_AP_NAME);
  delay(100);

  portalDns = new DNSServer();
  portalDns->start(53, "*", WiFi.softAPIP()); // captive: every hostname -> us

  portalServer = new WebServer(80);
  portalServer->onNotFound([]() {
    portalServer->sendHeader("Location", "http://192.168.4.1/", true);
    portalServer->send(302, "text/plain", "");
  });
  portalServer->on("/", HTTP_GET, []() {
    portalServer->send(200, "text/html; charset=utf-8", portalPage());
  });
  portalServer->on("/save", HTTP_POST, []() {
    String ssid = portalServer->arg("ssid");
    String pass = portalServer->arg("pass");
    String code = portalServer->arg("code");
    String server = portalServer->arg("server");
    ssid.trim(); pass.trim(); code.trim(); server.trim();
    if (server.endsWith("/")) server.remove(server.length() - 1);

    if (ssid.length() == 0) {
      portalServer->send(400, "text/plain; charset=utf-8", "חסרה רשת WiFi");
      return;
    }
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    if (code.length()) prefs.putString("deviceCode", code);
    if (server.length()) prefs.putString("serverUrl", server);

    portalServer->send(200, "text/html; charset=utf-8",
        "<html dir='rtl'><body style='font-family:sans-serif;padding:24px'>"
        "<h2>✅ נשמר!</h2><p>החיישן מתאתחל ומתחבר לרשת. אפשר לסגור את הדף.</p>"
        "</body></html>");
    delay(1500);
    ESP.restart();
  });
  portalServer->begin();
  Serial.printf("[portal] AP '%s' up at %s\n",
                SETUP_AP_NAME, WiFi.softAPIP().toString().c_str());
}

bool connectWifi() {
  Serial.printf("[wifi] connecting to '%s'\n", wifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 25000) {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected, ip=%s rssi=%d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  Serial.println("[wifi] connection failed");
  return false;
}

// ── Radar parsing ────────────────────────────────────────────────────────────

// LD2450 coordinates: MSB set = positive, clear = negative (not two's complement).
int16_t decodeCoord(uint8_t low, uint8_t high) {
  int16_t v = ((high & 0x7F) << 8) | low;
  return (high & 0x80) ? v : (int16_t)-v;
}

int countTargets(const uint8_t *frame) {
  int n = 0;
  for (int t = 0; t < 3; t++) {
    const uint8_t *p = frame + 4 + t * 8;
    // A slot with all-zero x/y is empty.
    if (p[0] || p[1] || p[2] || p[3]) n++;
  }
  return n;
}

void pumpRadar() {
  while (Serial1.available()) {
    uint8_t b = (uint8_t)Serial1.read();

    if (frameFill < 4) {
      // Hunt for the header byte-by-byte so we resync after any gap.
      if (b == FRAME_HEADER[frameFill]) {
        frameBuf[frameFill++] = b;
      } else {
        frameFill = (b == FRAME_HEADER[0]) ? 1 : 0;
        if (frameFill == 1) frameBuf[0] = b;
      }
      continue;
    }

    frameBuf[frameFill++] = b;
    if (frameFill < FRAME_LEN) continue;
    frameFill = 0;

    if (frameBuf[FRAME_LEN - 2] != 0x55 || frameBuf[FRAME_LEN - 1] != 0xCC) continue;

    lastFrameAt = millis();
    lastTargetCount = countTargets(frameBuf);
    if (lastTargetCount > 0) lastPresentAt = millis();
    else lastAbsentAt = millis();
  }
}

// ── Presence state machine ───────────────────────────────────────────────────

void updatePresence() {
  uint32_t now = millis();

  if (!occupied) {
    // Present right now, and continuously for occupiedAfterMs.
    if (lastPresentAt && now - lastPresentAt < 200 &&
        (lastAbsentAt == 0 || now - lastAbsentAt >= occupiedAfterMs)) {
      occupied = true;
      occupiedSince = now;
      pendingStart = true;
      Serial.println("[presence] occupied");
    }
  } else {
    if (lastAbsentAt && now - lastAbsentAt < 200 &&
        (lastPresentAt == 0 || now - lastPresentAt >= emptyAfterMs)) {
      occupied = false;
      pendingEnd = true;
      pendingEndDurationSec = (now - occupiedSince) / 1000;
      Serial.printf("[presence] empty after %lus\n",
                    (unsigned long)pendingEndDurationSec);
    }
  }
}

// ── Server reporting ─────────────────────────────────────────────────────────

bool postReport(const String &eventType, uint32_t durationSec) {
  if (deviceCode.length() == 0) {
    Serial.println("[report] no device code configured, skipping");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure(); // CA roots aren't bundled; transport is still TLS
  HTTPClient http;
  String url = serverUrl + "/api/sensors/" + deviceCode + "/report";
  if (!http.begin(client, url)) return false;
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"status\":\"";
  body += occupied ? "occupied" : "empty";
  body += "\",\"targets\":";
  body += lastTargetCount;
  body += ",\"radarAlive\":";
  body += (millis() - lastFrameAt < 3000) ? "true" : "false";
  body += ",\"firmware\":\"";
  body += FIRMWARE_VERSION;
  body += "\"";
  if (eventType.length()) {
    body += ",\"event\":\"" + eventType + "\"";
    body += ",\"durationSec\":";
    body += durationSec;
  }
  body += "}";

  int status = http.POST(body);
  bool ok = status >= 200 && status < 300;
  if (ok) applyServerConfig(http.getString());
  http.end();
  Serial.printf("[report] %s -> %d (%s)\n", url.c_str(), status, body.c_str());
  return ok;
}

void flushReports() {
  uint32_t now = millis();

  if (pendingStart) {
    if (postReport("presence_start", 0)) pendingStart = false;
    lastHeartbeatAt = now;
    return; // one blocking HTTP call per loop pass
  }
  if (pendingEnd) {
    if (postReport("presence_end", pendingEndDurationSec)) pendingEnd = false;
    lastHeartbeatAt = now;
    return;
  }
  if (now - lastHeartbeatAt >= HEARTBEAT_EVERY_MS) {
    lastHeartbeatAt = now;
    postReport("", 0);
  }
}

// ── Reset button ─────────────────────────────────────────────────────────────

void checkResetButton() {
  if (digitalRead(BOOT_BTN_PIN) == LOW) {
    if (bootBtnDownAt == 0) bootBtnDownAt = millis();
    else if (millis() - bootBtnDownAt > 5000) wipeAndReboot();
  } else {
    bootBtnDownAt = 0;
  }
}

// ── Arduino entrypoints ──────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(1500); // give USB CDC a moment so early logs show in the web console
  Serial.printf("\nToiletMon sensor bridge v%s\n", FIRMWARE_VERSION);

  pinMode(BOOT_BTN_PIN, INPUT_PULLUP);

  Serial1.setRxBufferSize(2048);
  Serial1.begin(RADAR_BAUD, SERIAL_8N1, RADAR_RX_PIN, RADAR_TX_PIN);
  Serial.println("[radar] UART up at 256000 baud (RX=15 TX=16)");

  loadConfig();

  if (wifiSsid.length() == 0) {
    startPortal();
    return;
  }
  if (!connectWifi()) {
    // Saved network unreachable — open the portal so it can be fixed, while
    // still retrying the saved network in the background every couple minutes.
    startPortal();
  }
}

void loop() {
  checkResetButton();

  if (portalMode) {
    portalDns->processNextRequest();
    portalServer->handleClient();

    // If we have saved credentials, keep retrying them; success reboots into
    // normal mode so a temporary router outage doesn't strand the portal.
    static uint32_t lastRetryAt = 0;
    if (wifiSsid.length() && millis() - lastRetryAt > 120000) {
      lastRetryAt = millis();
      if (connectWifi()) ESP.restart();
    }
    return;
  }

  pumpRadar();
  updatePresence();

  if (WiFi.status() != WL_CONNECTED) {
    static uint32_t lastReconnectAt = 0;
    if (millis() - lastReconnectAt > 15000) {
      lastReconnectAt = millis();
      Serial.println("[wifi] disconnected, reconnecting");
      WiFi.reconnect();
    }
    return;
  }

  flushReports();
}
