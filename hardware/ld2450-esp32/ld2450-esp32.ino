/*
 * HLK-LD2450 24GHz mmWave radar  ->  ESP32 DevKitV1 (NodeMCU, 30-pin)
 * -------------------------------------------------------------------
 * Wiring:
 *   LD2450 VCC -> VIN (5V)      (or 3V3 if VIN is unavailable)
 *   LD2450 GND -> GND
 *   LD2450 TX  -> GPIO16 (RX2)  <-- note: crossed!
 *   LD2450 RX  -> GPIO17 (TX2)  <-- note: crossed!
 *
 * Arduino IDE:
 *   - Board:  "ESP32 Dev Module"
 *   - Open Serial Monitor at 115200 baud
 *
 * The LD2450 streams 30-byte frames at 256000 baud, tracking up to 3
 * targets. Each frame:  AA FF 03 00 | [target x3, 8 bytes each] | 55 CC
 * Each target = X(2) Y(2) Speed(2) DistanceResolution(2), little-endian,
 * with a sign-in-MSB encoding (bit15 = 1 -> positive).
 */

#define RXD2 16   // ESP32 RX2  <- LD2450 TX
#define TXD2 17   // ESP32 TX2  -> LD2450 RX

struct Target { int16_t x, y, speed; uint16_t res; bool active; };
Target targets[3];

// Decode LD2450 signed coordinate (mm) / speed (cm/s)
static int16_t decode(uint8_t lo, uint8_t hi) {
  int16_t magnitude = ((hi & 0x7F) << 8) | lo;   // lower 15 bits
  return (hi & 0x80) ? magnitude : -magnitude;   // MSB set => positive
}

uint8_t frame[30];

// Sync to the frame header (AA FF) and read a full 30-byte frame.
static bool readFrame() {
  static uint8_t idx = 0;
  while (Serial2.available()) {
    uint8_t b = Serial2.read();
    if (idx == 0 && b != 0xAA) continue;          // wait for header byte 1
    if (idx == 1 && b != 0xFF) { idx = 0; continue; } // header byte 2
    frame[idx++] = b;
    if (idx >= 30) {
      idx = 0;
      if (frame[28] == 0x55 && frame[29] == 0xCC) return true; // valid tail
    }
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(256000, SERIAL_8N1, RXD2, TXD2);
  delay(500);
  Serial.println("\nHLK-LD2450 ready. Move in front of the sensor...");
}

void loop() {
  if (!readFrame()) return;

  int count = 0;
  for (int i = 0; i < 3; i++) {
    int o = 4 + i * 8;
    int16_t x = decode(frame[o],     frame[o + 1]);
    int16_t y = decode(frame[o + 2], frame[o + 3]);
    int16_t s = decode(frame[o + 4], frame[o + 5]);
    uint16_t r = frame[o + 6] | (frame[o + 7] << 8);
    bool active = (x != 0 || y != 0);
    targets[i] = { x, y, s, r, active };

    if (active) {
      count++;
      float dist_cm = sqrt((float)x * x + (float)y * y) / 10.0;
      Serial.printf("  Target %d:  X=%5d mm   Y=%5d mm   speed=%4d cm/s   dist=%.0f cm\n",
                    i + 1, x, y, s, dist_cm);
    }
  }

  if (count > 0) Serial.printf("PRESENCE: %d person(s) detected\n\n", count);
  else           Serial.println("no presence");

  delay(120);  // throttle the output so it's readable
}
