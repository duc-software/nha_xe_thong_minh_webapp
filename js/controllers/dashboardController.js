/**
 * ============================================================================
 * DASHBOARD CONTROLLER - ĐIỀU PHỐI POLLING ESP32 (200ms) VÀ THỐNG KÊ
 * ============================================================================
 * - Poll GET http://{IP}/data mỗi 200ms khi tab mở, dừng khi tab ẩn.
 * - Vẽ thẻ, 5 ô đỗ, barrie trực tiếp từ response của ESP, không từ Firebase.
 * - cars đổi: trong cùng tick cộng lượt vào/ra, vẽ biểu đồ, chèn dòng nhật ký (nguồn ESP).
 * - Không render lại cả 50 dòng, chèn một row lên đầu (prependEvent).
 * - Ghi Firebase chạy nền sau khi UI đã vẽ, lỗi/chưa config thì bỏ qua, không chờ onValue.
 * - Fetch lỗi: giữ số cũ, chấm đỏ, không reset cars về 0, không thêm nhật ký.
 * - Lưu parkStats trong localStorage.
 */

export class DashboardController {
  constructor({ parkingModel, espModel, firebaseModel, dashboardView, logView, controlView }) {
    this.parkingModel = parkingModel;
    this.espModel = espModel;
    this.firebaseModel = firebaseModel;
    this.dashboardView = dashboardView;
    this.logView = logView;
    this.controlView = controlView;

    this.pollTimer = null;
    this.isPollingActive = false;
    this.isFetching = false;
    this.isEspConnected = false;

    // Danh sách nhật ký sự kiện
    this.eventsList = this.loadEventsList();

    // Cờ đánh dấu lần poll đầu tiên sau khi F5 (chỉ nhớ mốc, không tính vào/ra)
    this.isFirstPollAfterLoad = true;
    this.previousCars = 0;
    this.parkStats = null;

    // Nạp stats từ localStorage key parkStats
    this.loadParkStats();

    // Theme hiện tại (light / dark)
    this.currentTheme = localStorage.getItem('parking_theme') || 'dark';

    this.init();
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this.dashboardView.updateThemeUI(theme);
  }

  loadEventsList() {
    const raw = localStorage.getItem('parkLog') || localStorage.getItem('parking_local_events');
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.slice(0, 50);
      } catch (e) {}
    }
    return [];
  }

  saveEventsList() {
    try {
      localStorage.setItem('parkLog', JSON.stringify(this.eventsList.slice(0, 50)));
    } catch (e) {}
  }

  getTodayDateVN() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    } catch (e) {
      return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    }
  }

  getCurrentHourVN() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: 'numeric',
        hourCycle: 'h23'
      }).formatToParts(new Date());
      const hourPart = parts.find((p) => p.type === 'hour');
      if (hourPart) {
        const val = parseInt(hourPart.value, 10);
        if (!isNaN(val) && val >= 0 && val < 24) return val;
      }
    } catch (e) {
      console.warn('Lỗi lấy giờ VN:', e);
    }
    return (new Date().getUTCHours() + 7) % 24;
  }

  loadParkStats() {
    const today = this.getTodayDateVN();
    const raw = localStorage.getItem('parkStats');
    let stats = null;

    if (raw) {
      try {
        stats = JSON.parse(raw);
      } catch (e) {
        stats = null;
      }
    }

    if (!stats || typeof stats !== 'object') {
      stats = {
        date: today,
        vao: 0,
        ra: 0,
        cars: this.parkingModel.cars || 0,
        hours: new Array(24).fill(0)
      };
    } else {
      stats.vao = Number(stats.vao) || 0;
      stats.ra = Number(stats.ra) || 0;
      stats.cars = Number(stats.cars) || 0;
      if (!Array.isArray(stats.hours) || stats.hours.length !== 24) {
        stats.hours = new Array(24).fill(0);
      } else {
        stats.hours = stats.hours.map((v) => Number(v) || 0);
      }

      // Qua ngày mới thì reset lượt vào, lượt ra, biểu đồ. Không reset số xe đang trong bãi.
      if (stats.date !== today) {
        stats.date = today;
        stats.vao = 0;
        stats.ra = 0;
        stats.hours = new Array(24).fill(0);
      }
    }

    this.parkStats = stats;
    this.previousCars = stats.cars;
    this.saveParkStats();
  }

  saveParkStats() {
    try {
      localStorage.setItem('parkStats', JSON.stringify(this.parkStats));
    } catch (e) {
      console.warn('Lỗi lưu parkStats:', e);
    }
  }

  init() {
    // 1. Khởi tạo IP ban đầu lên View và render stats đã lưu
    this.dashboardView.setIpValue(this.espModel.getIp());
    this.dashboardView.renderState(this.parkingModel.getState());
    this.logView.renderStats(this.parkStats);

    // Gán thẳng vào tbody mảng từ parkLog khi mở trang / F5, không chờ Firebase
    const log = JSON.parse(localStorage.getItem("parkLog") || "[]");
    this.renderLog(log.slice(0, 50));

    // 2. Gắn sự kiện từ View cho IP controls
    this.dashboardView.bindSaveIp((newIp) => {
      try {
        const savedIp = this.espModel.setIp(newIp);
        this.controlView.showToast(`Đã lưu IP ESP32: ${savedIp}`, 'success');
        this.restartPolling();
      } catch (err) {
        this.controlView.showToast(err.message, 'error');
      }
    });

    this.dashboardView.bindReconnect(() => {
      this.controlView.showToast('Đang kết nối lại với ESP32...', 'info');
      this.pollNow();
    });

    this.dashboardView.bindOpenConfig(() => {
      if (this.firebaseModel) {
        this.controlView.openFirebaseModal(this.firebaseModel.getConfig());
      }
    });

    this.controlView.bindSaveFirebaseConfig((cfg) => {
      if (this.firebaseModel) {
        this.firebaseModel.saveConfig(cfg);
        this.controlView.closeFirebaseModal();
        this.controlView.showToast('Đã lưu cấu hình Firebase!', 'success');
      }
    });

    // 3. Khởi tạo Theme Sáng/Tối và gắn sự kiện chuyển đổi giao diện
    this.applyTheme(this.currentTheme);
    this.dashboardView.bindToggleTheme(() => {
      this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('parking_theme', this.currentTheme);
      this.applyTheme(this.currentTheme);
      const modeName = this.currentTheme === 'dark' ? 'Tối (Night Mode)' : 'Sáng (Light Mode)';
      this.controlView.showToast(`Đã chuyển sang chế độ ${modeName}`, 'info');
    });

    // 4. Gắn sự kiện bộ lọc nhật ký và xuất CSV
    this.logView.bindFilterChange(() => {
      const currentLog = JSON.parse(localStorage.getItem("parkLog") || "[]");
      this.renderLog(currentLog.slice(0, 50));
    });

    this.logView.bindExportCsv(() => {
      const currentLog = JSON.parse(localStorage.getItem("parkLog") || "[]");
      this.logView.exportCsvToday(currentLog);
    });

    // 4. Quản lý Page Visibility API (Ẩn tab thì dừng, hiện lại poll ngay)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopPolling();
      } else {
        this.startPolling();
      }
    });

    // 5. Bắt đầu poll chu kỳ 200ms
    this.startPolling();

    // 6. Đồng hồ đếm Uptime phiên web
    setInterval(() => this.updateUptime(), 1000);
  }

  // Chạy đúng hàm onCars theo đặc tả: gọi mỗi lần /data thành công
  onCars(data) {
    const log = JSON.parse(localStorage.getItem("parkLog") || "[]");
    const rawPrev = localStorage.getItem("lastCars");
    const prev = rawPrev === null ? NaN : Number(rawPrev);

    if (!Number.isNaN(prev) && data.cars !== prev) {
      log.unshift({
        at: Date.now(),
        type: data.cars > prev ? "vao" : "ra",
        cars: data.cars,
        max: data.max,
        source: "ESP"
      });

      // Cập nhật thống kê lượt vào / ra và biểu đồ 24h
      const diff = data.cars - prev;
      if (diff > 0) {
        this.parkStats.vao += diff;
        const currentHour = this.getCurrentHourVN();
        this.parkStats.hours[currentHour] = (this.parkStats.hours[currentHour] || 0) + diff;
      } else {
        this.parkStats.ra += Math.abs(diff);
      }
      this.parkStats.cars = data.cars;
      this.saveParkStats();
      this.logView.renderStats(this.parkStats);
    }

    localStorage.setItem("lastCars", String(data.cars));
    localStorage.setItem("parkLog", JSON.stringify(log.slice(0, 50)));
    this.renderLog(log.slice(0, 50));
  }

  // Gán thẳng vào tbody. Mảng rỗng thì chữ "Chưa có lượt xe". Cấm render chữ "Đang tải dữ liệu...".
  renderLog(log) {
    const tbody = document.getElementById("eventsTableBody");
    if (!tbody) return;

    const list = Array.isArray(log) ? log : [];
    const filter = this.logView?.currentFilter || "all";

    const filtered = list.filter((ev) => {
      if (filter === "vao") return ev.type === "vao";
      if (filter === "ra") return ev.type === "ra";
      if (filter === "today") {
        const d = new Date(ev.at);
        const now = new Date();
        return d.getDate() === now.getDate() &&
               d.getMonth() === now.getMonth() &&
               d.getFullYear() === now.getFullYear();
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 18px;">Chưa có lượt xe</td>
        </tr>
      `;
      const countLabel = document.getElementById("logCountLabel");
      if (countLabel) countLabel.textContent = `0 / ${list.length} sự kiện`;
      return;
    }

    const pad = (n) => String(n).padStart(2, "0");
    let html = "";
    for (const ev of filtered) {
      const isIn = ev.type === "vao";
      const d = ev.at ? new Date(ev.at) : new Date();
      const timeStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const badge = isIn
        ? '<span class="badge-event-in">VÀO</span>'
        : '<span class="badge-event-out">RA</span>';
      const src = (ev.source || "ESP").toUpperCase();

      html += `
        <tr>
          <td style="font-family: monospace; font-size: 0.8rem;">${timeStr}</td>
          <td>${badge}</td>
          <td style="font-weight: 700;">${ev.cars !== undefined ? ev.cars : "--"} / ${ev.max || 5}</td>
          <td style="font-size: 0.75rem; color: var(--text-dim); font-family: monospace;">${src}</td>
        </tr>
      `;
    }

    tbody.innerHTML = html;

    const countLabel = document.getElementById("logCountLabel");
    if (countLabel) countLabel.textContent = `${filtered.length} / ${list.length} sự kiện`;
    const srcDisplay = document.getElementById("lastLogSourceDisplay");
    if (srcDisplay && list.length > 0) {
      srcDisplay.textContent = (list[0].source || "ESP").toUpperCase();
    }
  }

  // Chỗ poll: Gọi GET http://{IP}/data mỗi 200ms
  async pollNow() {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const data = await this.espModel.fetchParkingData();

      if (!this.isEspConnected) {
        this.isEspConnected = true;
        this.controlView.showToast(`Đã kết nối với ESP32 (${this.espModel.getIp()})`, 'success');
      }

      // 1. Kiểm tra qua ngày mới
      const today = this.getTodayDateVN();
      if (this.parkStats.date !== today) {
        this.parkStats.date = today;
        this.parkStats.vao = 0;
        this.parkStats.ra = 0;
        this.parkStats.hours = new Array(24).fill(0);
        this.saveParkStats();
        this.logView.renderStats(this.parkStats);
      }

      // 2. Chạy onCars(data) mỗi lần /data thành công, kể cả cars không đổi, để lần đổi sau có mốc
      this.onCars(data);

      // 3. Vẽ thẻ, 5 ô đỗ, barrie trực tiếp từ response này (không từ Firebase)
      const { state, shouldBeepAlert } = this.parkingModel.updateFromEsp(data);

      if (shouldBeepAlert) {
        this.dashboardView.playBeepAndRequestNotify();
        this.controlView.showToast('CẢNH BÁO: Bãi đỗ xe đã đầy!', 'error');
      }

      this.dashboardView.renderState(state);
      this.dashboardView.setConnectionStatus(true, state.lastPollTime);

      // 4. Ghi Firebase chạy nền sau khi UI đã vẽ (không đợi, lỗi bỏ qua)
      if (this.firebaseModel) {
        setTimeout(() => {
          try {
            if (typeof this.firebaseModel.syncState === 'function') {
              this.firebaseModel.syncState(state).catch(() => {});
            }
          } catch (e) {}
        }, 0);
      }

    } catch (err) {
      // Fetch lỗi: giữ số cũ, chấm đỏ, không reset cars về 0, không thêm nhật ký, không reset bảng
      if (this.isEspConnected) {
        this.isEspConnected = false;
        this.parkingModel.incrementLostConnection();
        this.controlView.showToast('Mất kết nối với ESP32!', 'error');
      }

      const currentState = this.parkingModel.getState();
      this.dashboardView.renderState(currentState);
      this.dashboardView.setConnectionStatus(false, currentState.lastPollTime);
    } finally {
      this.isFetching = false;
    }
  }

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.isPollingActive = true;
    this.pollNow();
    this.pollTimer = setInterval(() => this.pollNow(), 200); // Poll mỗi 200ms khi tab mở
  }

  stopPolling() {
    this.isPollingActive = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  restartPolling() {
    this.stopPolling();
    this.startPolling();
  }

  updateUptime() {
    const elapsed = Math.floor((Date.now() - this.parkingModel.sessionStartTime) / 1000);
    const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    this.dashboardView.renderUptime(`${hh}:${mm}:${ss}`);

    // Cập nhật banner barrie mở quá lâu (>20s) mỗi giây
    const currentState = this.parkingModel.getState();
    if (currentState.barrie === 'MO') {
      this.dashboardView.renderState(currentState);
    }
  }
}
