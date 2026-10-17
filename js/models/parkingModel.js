/**
 * ============================================================================
 * PARKING MODEL - QUẢN LÝ TRẠNG THÁI NỘI TẠI CỦA BÃI XE
 * ============================================================================
 * - Lưu trữ state: số xe, sức chứa, trạng thái bãi, trạng thái barrie.
 * - Nhớ cars cuối trong localStorage để chống nhân đôi khi tải lại trang (F5).
 * - Không can thiệp DOM.
 */

const STORAGE_KEY_LAST_CARS = 'parking_last_cars';

export class ParkingModel {
  constructor() {
    const savedCars = localStorage.getItem(STORAGE_KEY_LAST_CARS);
    this.cars = savedCars !== null ? Number(savedCars) : 0;
    this.lastCars = this.cars;
    this.max = 5;
    this.status = 'CON SLOT';
    this.barrie = 'DONG';
    this.barrieOpenedAt = null;
    this.lastPollTime = null;
    this.isFullAlertFired = false;
    this.lostConnectionCount = 0;
    this.sessionStartTime = Date.now();
  }

  // Chỗ suy ra vao/ra: So sánh số xe hiện tại với số xe trước đó
  updateFromEsp(data) {
    const newCars = Number(data.cars);
    const newMax = Number(data.max || 5);
    const newStatus = data.status || (newCars >= newMax ? 'FULL SLOT' : 'CON SLOT');
    const newBarrie = data.barrie || 'DONG';

    let transitionEvent = null;
    if (this.lastCars !== null && !isNaN(this.lastCars)) {
      if (newCars > this.lastCars) {
        transitionEvent = { type: 'vao', cars: newCars, max: newMax };
      } else if (newCars < this.lastCars) {
        transitionEvent = { type: 'ra', cars: newCars, max: newMax };
      }
    }

    this.cars = newCars;
    this.lastCars = newCars;
    this.max = newMax;
    this.status = newStatus;
    this.lastPollTime = new Date();

    // Nhớ cars cuối trong localStorage để không nhân đôi khi F5
    localStorage.setItem(STORAGE_KEY_LAST_CARS, String(newCars));

    // Theo dõi thời gian mở của Barrie
    if (newBarrie === 'MO') {
      if (!this.barrieOpenedAt) {
        this.barrieOpenedAt = Date.now();
      }
    } else {
      this.barrieOpenedAt = null;
    }
    this.barrie = newBarrie;

    // Kiểm tra chuyển từ còn chỗ sang full
    const isFull = this.cars >= this.max || this.status === 'FULL SLOT';
    let shouldBeepAlert = false;
    if (isFull && !this.isFullAlertFired) {
      shouldBeepAlert = true;
      this.isFullAlertFired = true;
    } else if (!isFull) {
      this.isFullAlertFired = false;
    }

    return {
      state: this.getState(),
      transitionEvent,
      shouldBeepAlert
    };
  }

  getBarrieOpenSeconds() {
    if (!this.barrieOpenedAt || this.barrie !== 'MO') return 0;
    return Math.floor((Date.now() - this.barrieOpenedAt) / 1000);
  }

  incrementLostConnection() {
    this.lostConnectionCount++;
    return this.lostConnectionCount;
  }

  getState() {
    return {
      cars: this.cars,
      max: this.max,
      status: this.status,
      barrie: this.barrie,
      occupancyRate: Math.min(100, Math.round((this.cars / this.max) * 100)),
      freeSlots: Math.max(0, this.max - this.cars),
      isFull: this.cars >= this.max || this.status === 'FULL SLOT',
      lastPollTime: this.lastPollTime,
      barrieOpenSeconds: this.getBarrieOpenSeconds(),
      lostConnectionCount: this.lostConnectionCount,
      sessionStartTime: this.sessionStartTime
    };
  }
}
