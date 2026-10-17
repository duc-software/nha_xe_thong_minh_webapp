/**
 * ============================================================================
 * ĐỒ ÁN NHÀ XE THÔNG MINH - ESP32 FIRMWARE SNIPPET
 * Phần cứng: ESP32, 2 Cảm biến siêu âm (HC-SR04), 1 Servo SG90 (Barrie),
 *            1 LCD I2C 16x2, 2 LED (Đỏ / Xanh).
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>

// --- THÔNG TIN WIFI VÀ FIREBASE ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
// Đường dẫn Firebase Realtime Database (không kèm https:// và không có dấu / ở cuối)
const char* FIREBASE_HOST = "nhaxethongminh-demo-default-rtdb.asia-southeast1.firebasedatabase.app";

// --- CẤU HÌNH CHÂN PHẦN CỨNG ---
#define TRIG_PIN_1 12  // Cảm biến 1 (Ngoài cổng)
#define ECHO_PIN_1 14
#define TRIG_PIN_2 27  // Cảm biến 2 (Trong cổng)
#define ECHO_PIN_2 26

#define SERVO_PIN  18  // Servo barrie
#define LED_GREEN  19  // Báo còn slot / barrie mở
#define LED_RED    21  // Báo full slot / barrie đóng

// --- BIẾN HỆ THỐNG ---
const int MAX_SLOTS = 5;
int soXe = 2; // Số xe ban đầu demo
int lastSoXe = 2;

// Trạng thái barrie: "MO" hoặc "DONG"
String barrieState = "DONG";
unsigned long barrieOpenMillis = 0;
bool isBarrieAutoClosePending = false;

// Trạng thái chuỗi cảm biến để nhận biết Vào / Ra
// 0: Chờ, 1: Xe kích hoạt cảm biến 1 trước, 2: Xe kích hoạt cảm biến 2 trước
int sensorSequence = 0;
unsigned long sensorTimeoutMillis = 0;

WebServer server(80);
Servo barrieServo;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Khởi tạo chứng chỉ bỏ qua kiểm tra SSL (phù hợp demo đồ án)
WiFiClientSecure clientSecure;

// ============================================================================
// HÀM ĐO KHOẢNG CÁCH SIÊU ÂM (CM)
// ============================================================================
long readDistanceCM(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 25000); // Timeout 25ms (~4m)
  if (duration == 0) return 999;
  return duration * 0.034 / 2;
}

// ============================================================================
// ĐIỀU KHIỂN SERVO BARRIE (KHÔNG DÙNG DELAY GÂY BLOCK HỆ THỐNG)
// ============================================================================
void openBarrie() {
  barrieServo.write(90); // Mở góc 90 độ
  barrieState = "MO";
  barrieOpenMillis = millis();
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED, LOW);
}

void closeBarrie() {
  barrieServo.write(0);  // Đóng góc 0 độ
  barrieState = "DONG";
  isBarrieAutoClosePending = false;
  if (soXe >= MAX_SLOTS) {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_RED, HIGH);
  } else {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_RED, LOW);
  }
}

// ============================================================================
// ĐỒNG BỘ DỮ LIỆU LÊN FIREBASE REALTIME DATABASE (KHÔNG BLOCK LUỒNG CHÍNH)
// ============================================================================
// Chỗ POST Firebase: Ghi event khi xe vào/ra và cập nhật /parking/state.json
void syncFirebase(String eventType, int currentCars) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(1500); // Spec: HTTPClient timeout 1500 ms

  String statusStr = (currentCars >= MAX_SLOTS) ? "FULL SLOT" : "CON SLOT";

  // 1. POST /parking/events.json ghi nhận lượt xe
  String eventsUrl = String("https://") + FIREBASE_HOST + "/parking/events.json";
  if (http.begin(clientSecure, eventsUrl)) {
    http.addHeader("Content-Type", "application/json");
    String payload = "{\"type\":\"" + eventType + "\",\"cars\":" + String(currentCars) + 
                     ",\"max\":5,\"at\":{\".sv\":\"timestamp\"},\"source\":\"esp\"}";
    
    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      Serial.printf("[Firebase] POST Event (%s) OK, code: %d\n", eventType.c_str(), httpCode);
    } else {
      // Fail thì bỏ qua, vòng sau ghi lại
      Serial.printf("[Firebase] POST Event thất bại: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }

  // 2. PUT /parking/state.json cập nhật trạng thái bãi đỗ
  String stateUrl = String("https://") + FIREBASE_HOST + "/parking/state.json";
  if (http.begin(clientSecure, stateUrl)) {
    http.addHeader("Content-Type", "application/json");
    String statePayload = "{\"cars\":" + String(currentCars) + 
                          ",\"max\":5,\"status\":\"" + statusStr + 
                          "\",\"barrie\":\"" + barrieState + 
                          "\",\"updatedAt\":{\".sv\":\"timestamp\"},\"ip\":\"" + WiFi.localIP().toString() + "\"}";
    
    int httpCode = http.PUT(statePayload);
    if (httpCode > 0) {
      Serial.printf("[Firebase] PUT State OK, code: %d\n", httpCode);
    } else {
      Serial.printf("[Firebase] PUT State thất bại: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
}

// ============================================================================
// CÁC ENDPOINT CỦA WEBSERVER LAN
// ============================================================================

// Chỗ poll: Web gọi GET /data mỗi 1 giây để cập nhật trạng thái
void handleGetData() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  String statusStr = (soXe >= MAX_SLOTS) ? "FULL SLOT" : "CON SLOT";
  String json = "{\"cars\":" + String(soXe) + 
                ",\"max\":" + String(MAX_SLOTS) + 
                ",\"status\":\"" + statusStr + 
                "\",\"barrie\":\"" + barrieState + "\"}";
  server.send(200, "application/json", json);
}

// Xử lý điều khiển Barrie từ Web (/barrie?action=open / close)
void handleBarrieControl() {
  // BẮT BUỘC: 2 dòng CORS trước mọi server.send của /barrie theo spec
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (!server.hasArg("action")) {
    server.send(400, "text/plain", "Thieu tham so action");
    return;
  }

  String action = server.arg("action");
  // Chỗ PIN: Lưu ý bảo mật kiểm tra mã PIN 4 số thực hiện trên Web trước khi gửi request tới đây.
  // Thao tác bấm tay không làm thay đổi biến đếm soXe.
  if (action == "open") {
    openBarrie();
    server.send(200, "text/plain", "Da mo barrie thanh cong");
  } else if (action == "close") {
    closeBarrie();
    server.send(200, "text/plain", "Da dong barrie thanh cong");
  } else {
    server.send(400, "text/plain", "Action khong hop le");
  }
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN_1, OUTPUT);
  pinMode(ECHO_PIN_1, INPUT);
  pinMode(TRIG_PIN_2, OUTPUT);
  pinMode(ECHO_PIN_2, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  barrieServo.attach(SERVO_PIN);
  closeBarrie();

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Parking");
  lcd.setCursor(0, 1);
  lcd.print("Dang ket noi...");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());
  clientSecure.setInsecure(); // Bỏ qua xác thực SSL cho demo

  // Khởi tạo các Route WebServer
  server.on("/data", HTTP_GET, handleGetData);
  server.on("/barrie", HTTP_GET, handleBarrieControl);
  server.begin();

  // Khởi tạo đồng bộ Firebase ban đầu
  syncFirebase("init", soXe);
}

// ============================================================================
// LOOP: XỬ LÝ SIÊU ÂM, LOGIC VÀO/RA VÀ ĐÓNG MỞ BARRIE TỰ ĐỘNG
// ============================================================================
void loop() {
  server.handleClient(); // Xử lý các request HTTP từ Web LAN

  unsigned long currentMillis = millis();

  // Tự động đóng barrie sau 4 giây kể từ khi xe qua cổng (không dùng delay)
  if (isBarrieAutoClosePending && (currentMillis - barrieOpenMillis >= 4000)) {
    closeBarrie();
  }

  // Đọc 2 cảm biến siêu âm định kỳ (mỗi 120ms đo 1 lần)
  static unsigned long lastSensorRead = 0;
  if (currentMillis - lastSensorRead >= 120) {
    lastSensorRead = currentMillis;

    long d1 = readDistanceCM(TRIG_PIN_1, ECHO_PIN_1);
    long d2 = readDistanceCM(TRIG_PIN_2, ECHO_PIN_2);
    const int THRESHOLD = 12; // Khoảng cách phát hiện xe (< 12 cm)

    bool s1 = (d1 < THRESHOLD);
    bool s2 = (d2 < THRESHOLD);

    // Chỗ suy ra vao/ra:
    // S1 phát hiện trước, sau đó S2 phát hiện -> XE VÀO
    // S2 phát hiện trước, sau đó S1 phát hiện -> XE RA
    if (sensorSequence == 0) {
      if (s1 && !s2) {
        sensorSequence = 1; // Xe đang từ ngoài vào
        sensorTimeoutMillis = currentMillis;
      } else if (s2 && !s1) {
        sensorSequence = 2; // Xe đang từ trong ra
        sensorTimeoutMillis = currentMillis;
      }
    } else if (sensorSequence == 1) { // Đang trong chuỗi VÀO
      if (s2) { // Cảm biến trong cổng đã kích hoạt -> Hoàn tất vào
        if (soXe < MAX_SLOTS) {
          soXe++;
          openBarrie();
          isBarrieAutoClosePending = true;
          // Snippet ESP32: Dán ngay sau khi soXe đổi, kích hoạt sync Firebase
          syncFirebase("vao", soXe);
        }
        sensorSequence = 0;
      } else if (currentMillis - sensorTimeoutMillis > 4000) {
        sensorSequence = 0; // Quá 4s xe không đi tiếp thì hủy chuỗi
      }
    } else if (sensorSequence == 2) { // Đang trong chuỗi RA
      if (s1) { // Cảm biến ngoài cổng đã kích hoạt -> Hoàn tất ra
        if (soXe > 0) {
          soXe--;
          openBarrie();
          isBarrieAutoClosePending = true;
          // Snippet ESP32: Dán ngay sau khi soXe đổi, kích hoạt sync Firebase
          syncFirebase("ra", soXe);
        }
        sensorSequence = 0;
      } else if (currentMillis - sensorTimeoutMillis > 4000) {
        sensorSequence = 0; // Hủy chuỗi nếu timeout
      }
    }
  }

  // Cập nhật màn hình LCD I2C định kỳ mỗi 500ms
  static unsigned long lastLcdUpdate = 0;
  if (currentMillis - lastLcdUpdate >= 500) {
    lastLcdUpdate = currentMillis;
    lcd.setCursor(0, 0);
    lcd.print("Xe: " + String(soXe) + "/" + String(MAX_SLOTS) + " ");
    lcd.print(soXe >= MAX_SLOTS ? "FULL " : "CON  ");

    lcd.setCursor(0, 1);
    lcd.print("Barrie: " + barrieState + "    ");
  }
}
