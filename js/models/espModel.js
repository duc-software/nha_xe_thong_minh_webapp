/**
 * ============================================================================
 * ESP MODEL - GIAO TIẾP VỚI ESP32 TRONG CÙNG MẠNG LAN
 * ============================================================================
 * - Thực hiện GET http://{IP}/data và GET http://{IP}/barrie
 * - Mặc định IP: 192.168.1.50 (lưu localStorage)
 * - Không can thiệp DOM. Trả dữ liệu hoặc quăng lỗi đúng đặc tả.
 */

const STORAGE_KEY_IP = 'parking_esp_ip';
const DEFAULT_IP = '192.168.1.50';

export class EspModel {
  constructor() {
    this.ip = localStorage.getItem(STORAGE_KEY_IP) || DEFAULT_IP;
  }

  getIp() {
    return this.ip;
  }

  setIp(newIp) {
    const cleaned = String(newIp).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleaned) throw new Error('IP ESP32 không hợp lệ');
    this.ip = cleaned;
    localStorage.setItem(STORAGE_KEY_IP, this.ip);
    return this.ip;
  }

  // Chỗ poll: Gọi GET http://{IP}/data mỗi 200ms để lấy cars, max, status, barrie
  async fetchParkingData() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);

    try {
      const url = `http://${this.ip}/data`;
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // Gửi lệnh đóng/mở barrie: GET http://{IP}/barrie?action=open|close
  async sendBarrieAction(action) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
      const url = `http://${this.ip}/barrie?action=${action}`;
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const text = await response.text();
      return { ok: true, message: text || 'Thành công' };
    } catch (err) {
      clearTimeout(timeoutId);
      // Có thể thiếu CORS. Báo lỗi đúng câu "ESP chặn CORS ở /barrie"
      throw new Error('ESP chặn CORS ở /barrie');
    }
  }
}
