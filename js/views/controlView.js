/**
 * ============================================================================
 * CONTROL VIEW - QUẢN LÝ NÚT KHẨN CẤP, MODAL PIN VÀ CẤU HÌNH
 * ============================================================================
 * - Chỉ chịu trách nhiệm giao diện, bật/tắt modal, khóa nút và phát sự kiện.
 * - Không fetch, không Firebase.
 */

export class ControlView {
  constructor() {
    this.btnEmergencyOpen = document.getElementById('btnEmergencyOpen');
    this.btnEmergencyClose = document.getElementById('btnEmergencyClose');
    this.btnChangePin = document.getElementById('btnChangePin');

    // PIN Modal
    this.pinModal = document.getElementById('pinModal');
    this.pinModalTitle = document.getElementById('pinModalTitle');
    this.inputPinCode = document.getElementById('inputPinCode');
    this.pinErrorMessage = document.getElementById('pinErrorMessage');
    this.btnConfirmPin = document.getElementById('btnConfirmPin');
    this.btnCancelPin = document.getElementById('btnCancelPin');
    this.currentPendingAction = null;

    // Change PIN Modal
    this.changePinModal = document.getElementById('changePinModal');
    this.inputOldPin = document.getElementById('inputOldPin');
    this.inputNewPin = document.getElementById('inputNewPin');
    this.inputConfirmNewPin = document.getElementById('inputConfirmNewPin');
    this.changePinError = document.getElementById('changePinError');
    this.btnCancelChangePin = document.getElementById('btnCancelChangePin');
    this.btnSaveNewPin = document.getElementById('btnSaveNewPin');

    // Firebase Modal
    this.firebaseModal = document.getElementById('firebaseModal');
    this.fbDatabaseUrl = document.getElementById('fbDatabaseUrl');
    this.fbApiKey = document.getElementById('fbApiKey');
    this.fbAuthDomain = document.getElementById('fbAuthDomain');
    this.fbProjectId = document.getElementById('fbProjectId');
    this.btnCancelFb = document.getElementById('btnCancelFb');
    this.btnSaveFbConfig = document.getElementById('btnSaveFbConfig');

    this.toastContainer = document.getElementById('toastContainer');

    this.setupInternalModalEvents();
  }

  setupInternalModalEvents() {
    this.btnCancelPin.addEventListener('click', () => this.closePinModal());
    this.btnCancelChangePin.addEventListener('click', () => this.closeChangePinModal());
    this.btnCancelFb.addEventListener('click', () => this.closeFirebaseModal());
  }

  // Khóa nút khi đang gửi lệnh
  setButtonsBusy(isBusy) {
    this.btnEmergencyOpen.disabled = isBusy;
    this.btnEmergencyClose.disabled = isBusy;
  }

  openPinModal(action) {
    this.currentPendingAction = action;
    this.pinModalTitle.textContent = action === 'open' 
      ? 'Xác nhận MỞ Barrie' 
      : 'Xác nhận ĐÓNG Barrie';
    this.inputPinCode.value = '';
    this.pinErrorMessage.style.display = 'none';
    this.pinModal.classList.add('open');
    this.inputPinCode.focus();
  }

  closePinModal() {
    this.pinModal.classList.remove('open');
    this.currentPendingAction = null;
  }

  showPinError(message) {
    this.pinErrorMessage.textContent = message;
    this.pinErrorMessage.style.display = 'block';
  }

  confirmSecondTime(action) {
    const text = action === 'open'
      ? 'BẠN CÓ CHẮC CHẮN MUỐN MỞ BARRIE KHẨN CẤP?\n(Hành động này sẽ không tính thêm xe vào bãi)'
      : 'BẠN CÓ CHẮC CHẮN MUỐN ĐÓNG BARRIE KHẨN CẤP?';
    return window.confirm(text);
  }

  openChangePinModal() {
    this.inputOldPin.value = '';
    this.inputNewPin.value = '';
    this.inputConfirmNewPin.value = '';
    this.changePinError.style.display = 'none';
    this.changePinModal.classList.add('open');
    this.inputOldPin.focus();
  }

  closeChangePinModal() {
    this.changePinModal.classList.remove('open');
  }

  showChangePinError(message) {
    this.changePinError.textContent = message;
    this.changePinError.style.display = 'block';
  }

  openFirebaseModal(config) {
    this.fbDatabaseUrl.value = config.databaseURL || '';
    this.fbApiKey.value = config.apiKey || '';
    this.fbAuthDomain.value = config.authDomain || '';
    this.fbProjectId.value = config.projectId || '';
    this.firebaseModal.classList.add('open');
  }

  closeFirebaseModal() {
    this.firebaseModal.classList.remove('open');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  bindEmergencyAction(handler) {
    this.btnEmergencyOpen.addEventListener('click', () => handler('open'));
    this.btnEmergencyClose.addEventListener('click', () => handler('close'));
  }

  bindPinSubmit(handler) {
    const submit = () => {
      const pin = this.inputPinCode.value.trim();
      const action = this.currentPendingAction;
      handler(pin, action);
    };

    this.btnConfirmPin.addEventListener('click', submit);
    this.inputPinCode.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  bindChangePinSubmit(handler) {
    this.btnChangePin.addEventListener('click', () => this.openChangePinModal());
    this.btnSaveNewPin.addEventListener('click', () => {
      const oldPin = this.inputOldPin.value.trim();
      const newPin = this.inputNewPin.value.trim();
      const confirmPin = this.inputConfirmNewPin.value.trim();
      handler(oldPin, newPin, confirmPin);
    });
  }

  bindSaveFirebaseConfig(handler) {
    this.btnSaveFbConfig.addEventListener('click', () => {
      const cfg = {
        databaseURL: this.fbDatabaseUrl.value.trim(),
        apiKey: this.fbApiKey.value.trim(),
        authDomain: this.fbAuthDomain.value.trim(),
        projectId: this.fbProjectId.value.trim()
      };
      handler(cfg);
    });
  }
}
