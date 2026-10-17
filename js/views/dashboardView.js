/**
 * ============================================================================
 * DASHBOARD VIEW - HIỂN THỊ TRẠNG THÁI CHÍNH, SƠ ĐỒ VÀ CẢNH BÁO
 * ============================================================================
 * - Render DOM và phát sự kiện click/input cho IP controls.
 * - Không fetch, không Firebase.
 */

const CAR_SVG_MARKUP = `
  <svg width="36" height="50" viewBox="0 0 40 60" fill="none">
    <rect x="2" y="8" width="4" height="10" rx="2" fill="#0f172a" />
    <rect x="34" y="8" width="4" height="10" rx="2" fill="#0f172a" />
    <rect x="2" y="42" width="4" height="10" rx="2" fill="#0f172a" />
    <rect x="34" y="42" width="4" height="10" rx="2" fill="#0f172a" />
    <rect x="5" y="4" width="30" height="52" rx="7" fill="#0284c7" />
    <path d="M8 18 L32 18 L30 12 L10 12 Z" fill="#075985" />
    <rect x="9" y="19" width="22" height="22" rx="3" fill="#0369a1" />
    <path d="M9 42 L31 42 L29 46 L11 46 Z" fill="#075985" />
    <rect x="8" y="5" width="4" height="2" rx="1" fill="#fef08a" />
    <rect x="28" y="5" width="4" height="2" rx="1" fill="#fef08a" />
  </svg>
`;

const EMPTY_SLOT_MARKUP = `
  <div style="width: 36px; height: 50px; border: 2px dashed var(--border-light); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--text-dim); font-weight: 800;">
    P
  </div>
`;

export class DashboardView {
  constructor() {
    this.connIndicator = document.getElementById('connIndicator');
    this.espIpInput = document.getElementById('espIpInput');
    this.btnSaveIp = document.getElementById('btnSaveIp');
    this.btnReconnect = document.getElementById('btnReconnect');
    this.btnOpenFirebaseModal = document.getElementById('btnOpenFirebaseModal');
    this.btnToggleTheme = document.getElementById('btnToggleTheme');
    this.themeIconDark = document.querySelector('.theme-icon-dark');
    this.themeIconLight = document.querySelector('.theme-icon-light');
    this.themeToggleText = document.getElementById('themeToggleText');

    this.carsCountDisplay = document.getElementById('carsCountDisplay');
    this.occupancyRateDisplay = document.getElementById('occupancyRateDisplay');
    this.freeSlotsDisplay = document.getElementById('freeSlotsDisplay');
    this.parkingStatusBadge = document.getElementById('parkingStatusBadge');
    this.barrieStatusBadge = document.getElementById('barrieStatusBadge');
    this.capacityBarFill = document.getElementById('capacityBarFill');
    this.pollTimeDisplay = document.getElementById('pollTimeDisplay');

    this.parkingLotContainer = document.getElementById('parkingLotContainer');
    this.bannerOpenTooLong = document.getElementById('bannerOpenTooLong');
    this.openDurationDisplay = document.getElementById('openDurationDisplay');

    this.sessionUptimeDisplay = document.getElementById('sessionUptimeDisplay');
    this.lostConnCountDisplay = document.getElementById('lostConnCountDisplay');

    this.hasRequestedNotify = false;
  }

  setIpValue(ip) {
    if (this.espIpInput) this.espIpInput.value = ip;
  }

  setConnectionStatus(isOnline, lastPollDate = null) {
    if (isOnline) {
      this.connIndicator.classList.add('online');
      if (lastPollDate) {
        this.pollTimeDisplay.textContent = `Poll lúc: ${lastPollDate.toLocaleTimeString('vi-VN')}`;
      }
    } else {
      this.connIndicator.classList.remove('online');
      if (lastPollDate) {
        this.pollTimeDisplay.textContent = `Mất kết nối (lần cuối: ${lastPollDate.toLocaleTimeString('vi-VN')})`;
      } else {
        this.pollTimeDisplay.textContent = 'Mất kết nối ESP';
      }
    }
  }

  renderState(state) {
    // 1. Thẻ lớn
    this.carsCountDisplay.textContent = `${state.cars} / ${state.max}`;
    this.occupancyRateDisplay.textContent = `${state.occupancyRate}%`;
    this.freeSlotsDisplay.textContent = `${state.freeSlots} ô`;

    this.capacityBarFill.style.width = `${state.occupancyRate}%`;
    this.capacityBarFill.className = state.occupancyRate >= 100 
      ? 'capacity-bar-fill warning' 
      : 'capacity-bar-fill';

    if (state.isFull) {
      this.parkingStatusBadge.textContent = 'FULL';
      this.parkingStatusBadge.className = 'stat-badge badge-full';
    } else {
      this.parkingStatusBadge.textContent = 'CÒN CHỖ';
      this.parkingStatusBadge.className = 'stat-badge badge-con-cho';
    }

    if (state.barrie === 'MO') {
      this.barrieStatusBadge.textContent = 'MỞ';
      this.barrieStatusBadge.className = 'stat-badge badge-barrie-open';
    } else {
      this.barrieStatusBadge.textContent = 'ĐÓNG';
      this.barrieStatusBadge.className = 'stat-badge badge-barrie-closed';
    }

    // 2. Sơ đồ 5 ô đỗ
    this.renderParkingDiagram(state.cars, state.max, state.isFull);

    // 3. Cập nhật banner barrie mở quá lâu (>20s)
    if (state.barrieOpenSeconds > 20) {
      this.bannerOpenTooLong.style.display = 'flex';
      this.openDurationDisplay.textContent = `(${state.barrieOpenSeconds}s)`;
    } else {
      this.bannerOpenTooLong.style.display = 'none';
    }

    // 4. Lost connection counter
    if (this.lostConnCountDisplay) {
      this.lostConnCountDisplay.textContent = state.lostConnectionCount;
    }
  }

  renderParkingDiagram(cars, max = 5, isFull = false) {
    if (isFull) {
      this.parkingLotContainer.classList.add('is-full-row');
    } else {
      this.parkingLotContainer.classList.remove('is-full-row');
    }

    const occupied = Math.max(0, Math.min(max, Number(cars) || 0));
    let html = '';
    for (let i = 1; i <= max; i++) {
      const isOcc = i <= occupied;
      html += `
        <div class="slot-card ${isOcc ? 'occupied' : 'empty'}">
          <span class="slot-num">Ô ${i}</span>
          <div style="margin: 6px 0;">
            ${isOcc ? CAR_SVG_MARKUP : EMPTY_SLOT_MARKUP}
          </div>
          <span class="slot-state-text">${isOcc ? 'ĐÃ ĐỖ' : 'TRỐNG'}</span>
        </div>
      `;
    }
    this.parkingLotContainer.innerHTML = html;
  }

  renderUptime(uptimeStr) {
    if (this.sessionUptimeDisplay) {
      this.sessionUptimeDisplay.textContent = uptimeStr;
    }
  }

  playBeepAndRequestNotify() {
    // 1. Web Audio beep ngắn
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      console.warn('Audio error:', e);
    }

    // 2. Xin quyền Notification một lần
    if ('Notification' in window && !this.hasRequestedNotify) {
      this.hasRequestedNotify = true;
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }

  bindSaveIp(handler) {
    if (this.btnSaveIp) {
      this.btnSaveIp.addEventListener('click', () => {
        const val = this.espIpInput ? this.espIpInput.value : '';
        handler(val);
      });
    }
  }

  bindReconnect(handler) {
    if (this.btnReconnect) {
      this.btnReconnect.addEventListener('click', () => handler());
    }
  }

  bindOpenConfig(handler) {
    if (this.btnOpenFirebaseModal) {
      this.btnOpenFirebaseModal.addEventListener('click', () => handler());
    }
  }

  updateThemeUI(theme) {
    if (this.themeIconDark && this.themeIconLight && this.themeToggleText) {
      if (theme === 'light') {
        this.themeIconDark.style.display = 'none';
        this.themeIconLight.style.display = 'inline-block';
        this.themeToggleText.textContent = 'Sáng';
      } else {
        this.themeIconDark.style.display = 'inline-block';
        this.themeIconLight.style.display = 'none';
        this.themeToggleText.textContent = 'Tối';
      }
    }
  }

  bindToggleTheme(handler) {
    if (this.btnToggleTheme) {
      this.btnToggleTheme.addEventListener('click', () => handler());
    }
  }
}
