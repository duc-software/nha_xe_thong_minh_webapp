/**
 * ============================================================================
 * PIN SERVICE - QUẢN LÝ VÀ XÁC THỰC MÃ PIN BẢO MẬT
 * ============================================================================
 * - Lưu mã PIN dưới dạng SHA-256 hash trong localStorage.
 * - Mặc định: 1234.
 * - Không truy cập DOM, chỉ thực hiện nghiệp vụ mã hóa và so khớp.
 */

const STORAGE_KEY = 'parking_pin_hash';
const DEFAULT_PIN = '1234';

class PinService {
  /**
   * Tạo chuỗi hash SHA-256 từ mã PIN thuần
   * @param {string} pin 
   * @returns {Promise<string>}
   */
  async hash(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(String(pin).trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Khởi tạo mã PIN mặc định vào localStorage nếu chưa có
   */
  async init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      const defaultHash = await this.hash(DEFAULT_PIN);
      localStorage.setItem(STORAGE_KEY, defaultHash);
    }
  }

  /**
   * Chỗ kiểm PIN: So khớp mã PIN nhập vào với mã hash đã lưu
   * @param {string} inputPin 
   * @returns {Promise<boolean>}
   */
  async verifyPin(inputPin) {
    await this.init();
    if (!inputPin) return false;
    const inputHash = await this.hash(inputPin);
    const savedHash = localStorage.getItem(STORAGE_KEY);
    return inputHash === savedHash;
  }

  /**
   * Thay đổi mã PIN mới (yêu cầu xác thực mã cũ)
   * @param {string} oldPin 
   * @param {string} newPin 
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async changePin(oldPin, newPin) {
    const isOldValid = await this.verifyPin(oldPin);
    if (!isOldValid) {
      return { success: false, message: 'Mã PIN hiện tại không chính xác' };
    }

    const trimmedNew = String(newPin).trim();
    if (trimmedNew.length < 4) {
      return { success: false, message: 'Mã PIN mới phải có ít nhất 4 ký tự' };
    }

    const newHash = await this.hash(trimmedNew);
    localStorage.setItem(STORAGE_KEY, newHash);
    return { success: true, message: 'Đổi mã PIN thành công' };
  }
}

export const pinService = new PinService();
