/**
 * ============================================================================
 * LOG VIEW - HIỂN THỊ NHẬT KÝ REALTIME, THỐNG KÊ HÔM NAY VÀ BIỂU ĐỒ 24 GIỜ
 * ============================================================================
 * - Chỉ chịu trách nhiệm render bảng, chart CSS thuần và xuất CSV.
 * - Không fetch, không Firebase.
 */

export class LogView {
  constructor() {
    this.eventsTableBody = document.getElementById('eventsTableBody');
    this.logCountLabel = document.getElementById('logCountLabel');
    this.statTodayIn = document.getElementById('statTodayIn');
    this.statTodayOut = document.getElementById('statTodayOut');
    this.statCurrentlyInside = document.getElementById('statCurrentlyInside');
    this.peakHourDisplay = document.getElementById('peakHourDisplay');
    this.hourlyBarsContainer = document.getElementById('hourlyBarsContainer');
    this.lastLogSourceDisplay = document.getElementById('lastLogSourceDisplay');
    this.btnExportCsv = document.getElementById('btnExportCsv');
    this.filterButtons = document.querySelectorAll('.chip-btn');

    this.currentFilter = 'all';
  }

  formatDateTimeVN(timestamp, timeStr) {
    if (timeStr && typeof timeStr === 'string' && timeStr.trim()) return timeStr;
    if (!timestamp) return '--/-- --:--:--';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  isToday(timestamp) {
    if (!timestamp) return false;
    const d = new Date(timestamp);
    const now = new Date();
    return d.getDate() === now.getDate() &&
           d.getMonth() === now.getMonth() &&
           d.getFullYear() === now.getFullYear();
  }

  renderEvents(eventsList, currentCars = 0) {
    // Lọc sự kiện theo tab
    const filtered = eventsList.filter((ev) => {
      if (this.currentFilter === 'vao') return ev.type === 'vao';
      if (this.currentFilter === 'ra') return ev.type === 'ra';
      if (this.currentFilter === 'today') return this.isToday(ev.at);
      return true;
    });

    this.logCountLabel.textContent = `${filtered.length} / ${eventsList.length} sự kiện`;

    if (filtered.length === 0) {
      this.eventsTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 18px;">
            Chưa có lượt xe
          </td>
        </tr>
      `;
    } else {
      let html = '';
      filtered.forEach((ev) => {
        const isIn = ev.type === 'vao';
        const dateStr = ev.time || this.formatDateTimeVN(ev.at);
        const badge = isIn 
          ? `<span class="badge-event-in">VÀO</span>` 
          : `<span class="badge-event-out">RA</span>`;
        const src = (ev.source || 'ESP').toUpperCase();

        html += `
          <tr>
            <td style="font-family: monospace; font-size: 0.8rem;">${dateStr}</td>
            <td>${badge}</td>
            <td style="font-weight: 700;">${ev.cars !== undefined ? ev.cars : '--'} / ${ev.max || 5}</td>
            <td style="font-size: 0.75rem; color: var(--text-dim); font-family: monospace;">${src}</td>
          </tr>
        `;
      });
      this.eventsTableBody.innerHTML = html;
    }

    // Cập nhật nguồn log gần nhất
    if (eventsList.length > 0 && this.lastLogSourceDisplay) {
      this.lastLogSourceDisplay.textContent = (eventsList[0].source || 'ESP').toUpperCase();
    }
  }

  // Gán thẳng vào tbody theo mảng log
  renderLog(log) {
    if (!this.eventsTableBody) {
      this.eventsTableBody = document.getElementById('eventsTableBody');
    }
    if (!this.eventsTableBody) return;

    if (!log || log.length === 0) {
      this.eventsTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-dim); padding: 18px;">Chưa có lượt xe</td>
        </tr>
      `;
      if (this.logCountLabel) this.logCountLabel.textContent = '0 sự kiện';
      return;
    }

    const pad = (n) => String(n).padStart(2, '0');
    let html = '';
    log.forEach((ev) => {
      const isIn = ev.type === 'vao';
      const d = ev.at ? new Date(ev.at) : new Date();
      const timeStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const badge = isIn 
        ? `<span class="badge-event-in">VÀO</span>` 
        : `<span class="badge-event-out">RA</span>`;
      const src = (ev.source || 'ESP').toUpperCase();

      html += `
        <tr>
          <td style="font-family: monospace; font-size: 0.8rem;">${timeStr}</td>
          <td>${badge}</td>
          <td style="font-weight: 700;">${ev.cars !== undefined ? ev.cars : '--'} / ${ev.max || 5}</td>
          <td style="font-size: 0.75rem; color: var(--text-dim); font-family: monospace;">${src}</td>
        </tr>
      `;
    });

    this.eventsTableBody.innerHTML = html;
    if (this.logCountLabel) this.logCountLabel.textContent = `${log.length} / ${log.length} sự kiện`;
    if (this.lastLogSourceDisplay && log.length > 0) {
      this.lastLogSourceDisplay.textContent = (log[0].source || 'ESP').toUpperCase();
    }
  }

  // Chèn một dòng nhật ký lên đầu bảng (không render lại cả 50 dòng)
  prependEvent(ev, totalCount = 1) {
    if (!ev) return;

    // Bỏ chữ đang tải / chưa có lượt xe nếu đang có hàng placeholder
    const placeholderRow = this.eventsTableBody.querySelector('tr td[colspan]');
    if (placeholderRow || this.eventsTableBody.textContent.includes('Đang tải') || this.eventsTableBody.textContent.includes('Chưa có')) {
      this.eventsTableBody.innerHTML = '';
    }

    // Kiểm tra bộ lọc
    let matchesFilter = true;
    if (this.currentFilter === 'vao' && ev.type !== 'vao') matchesFilter = false;
    if (this.currentFilter === 'ra' && ev.type !== 'ra') matchesFilter = false;
    if (this.currentFilter === 'today' && !this.isToday(ev.at)) matchesFilter = false;

    if (matchesFilter) {
      const row = document.createElement('tr');
      const isIn = ev.type === 'vao';
      const dateStr = ev.time || this.formatDateTimeVN(ev.at);
      const badge = isIn 
        ? `<span class="badge-event-in">VÀO</span>` 
        : `<span class="badge-event-out">RA</span>`;
      const src = (ev.source || 'ESP').toUpperCase();

      row.innerHTML = `
        <td style="font-family: monospace; font-size: 0.8rem;">${dateStr}</td>
        <td>${badge}</td>
        <td style="font-weight: 700;">${ev.cars !== undefined ? ev.cars : '--'} / ${ev.max || 5}</td>
        <td style="font-size: 0.75rem; color: var(--text-dim); font-family: monospace;">${src}</td>
      `;

      if (this.eventsTableBody.firstChild) {
        this.eventsTableBody.insertBefore(row, this.eventsTableBody.firstChild);
      } else {
        this.eventsTableBody.appendChild(row);
      }

      // Giữ tối đa 50 dòng
      while (this.eventsTableBody.children.length > 50) {
        this.eventsTableBody.removeChild(this.eventsTableBody.lastChild);
      }
    }

    const currentRows = this.eventsTableBody.querySelectorAll('tr:not(:has(td[colspan]))').length;
    this.logCountLabel.textContent = `${currentRows} / ${totalCount} sự kiện`;
    if (this.lastLogSourceDisplay) {
      this.lastLogSourceDisplay.textContent = (ev.source || 'ESP').toUpperCase();
    }
  }

  renderStats(stats) {
    if (!stats) return;
    this.statTodayIn.textContent = stats.vao !== undefined ? stats.vao : 0;
    this.statTodayOut.textContent = stats.ra !== undefined ? stats.ra : 0;
    this.statCurrentlyInside.textContent = stats.cars !== undefined ? stats.cars : 0;

    const hours = Array.isArray(stats.hours) ? stats.hours : new Array(24).fill(0);

    // Tìm giờ cao điểm
    let maxHour = -1;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
      const val = hours[h] || 0;
      if (val > maxCount) {
        maxCount = val;
        maxHour = h;
      }
    }

    if (maxHour !== -1 && maxCount > 0) {
      this.peakHourDisplay.textContent = `Cao điểm: ${maxHour}h - ${maxHour + 1}h (${maxCount} xe)`;
    } else {
      this.peakHourDisplay.textContent = 'Cao điểm: Chưa có';
    }

    // Render 24 cột CSS thuần
    let barsHtml = '';
    const ceiling = Math.max(maxCount, 4);
    for (let h = 0; h < 24; h++) {
      const count = hours[h] || 0;
      const heightPct = count > 0 ? Math.max(8, Math.round((count / ceiling) * 100)) : 3;
      const isPeak = h === maxHour && count > 0;
      barsHtml += `
        <div class="bar-col">
          <div class="bar-tooltip">${h}h: ${count} xe</div>
          <div class="bar-fill ${isPeak ? 'active-peak' : ''}" style="height: ${heightPct}%;"></div>
        </div>
      `;
    }
    this.hourlyBarsContainer.innerHTML = barsHtml;
  }

  exportCsvToday(eventsList) {
    const todayEvents = eventsList.filter((ev) => this.isToday(ev.at));
    if (todayEvents.length === 0) {
      alert('Không có dữ liệu nhật ký hôm nay để xuất!');
      return;
    }

    let csv = '\uFEFFSTT,Thời Gian,Loại Sự Kiện,Số Xe,Sức Chứa,Nguồn\n';
    todayEvents.forEach((ev, idx) => {
      const timeStr = `"${this.formatDateTimeVN(ev.at)}"`;
      const typeStr = ev.type === 'vao' ? 'VÀO' : 'RA';
      const cars = ev.cars !== undefined ? ev.cars : '';
      const max = ev.max || 5;
      const src = ev.source || 'esp';
      csv += `${idx + 1},${timeStr},${typeStr},${cars},${max},${src}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nhat_ky_do_xe_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  bindFilterChange(handler) {
    this.filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filterButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        handler(this.currentFilter);
      });
    });
  }

  bindExportCsv(handler) {
    this.btnExportCsv.addEventListener('click', () => handler());
  }
}
