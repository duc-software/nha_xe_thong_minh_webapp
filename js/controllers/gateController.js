/**
 * ============================================================================
 * GATE CONTROLLER - ĐIỀU KHIỂN CỔNG BARRIE QUA IP ESP32 VÀ XÁC THỰC BẢO MẬT
 * ============================================================================
 * - Nút Mở/Đóng barrie gọi GET http://{IP}/barrie?action=open|close sau khi đúng PIN 1234 và confirm.
 * - Giữ tính năng đổi PIN.
 * - Không ghi /parking/commands/barrie.
 * - Khóa nút khi đang gửi, không đếm xe khi bấm tay.
 */

export class GateController {
  constructor({ pinService, espModel, controlView }) {
    this.pinService = pinService;
    this.espModel = espModel;
    this.controlView = controlView;

    this.init();
  }

  init() {
    // 1. Nhấn nút Mở/Đóng -> Mở modal yêu cầu PIN
    this.controlView.bindEmergencyAction((action) => {
      this.controlView.openPinModal(action);
    });

    // 2. Chỗ kiểm PIN: Xác thực PIN 4 số và xác nhận lần 2
    this.controlView.bindPinSubmit(async (pin, action) => {
      if (!pin) {
        this.controlView.showPinError('Vui lòng nhập mã PIN!');
        return;
      }

      const isValid = await this.pinService.verifyPin(pin);
      if (!isValid) {
        this.controlView.showPinError('Mã PIN không chính xác!');
        return;
      }

      this.controlView.closePinModal();

      // Xác nhận lần thứ 2 trước khi thực thi
      const confirmed = this.controlView.confirmSecondTime(action);
      if (!confirmed) return;

      await this.executeEmergencyCommand(action);
    });

    // 3. Đổi mã PIN
    this.controlView.bindChangePinSubmit(async (oldPin, newPin, confirmPin) => {
      if (newPin !== confirmPin) {
        this.controlView.showChangePinError('Mã PIN xác nhận không khớp!');
        return;
      }

      const result = await this.pinService.changePin(oldPin, newPin);
      if (!result.success) {
        this.controlView.showChangePinError(result.message);
      } else {
        this.controlView.closeChangePinModal();
        this.controlView.showToast(result.message, 'success');
      }
    });
  }

  // Nút mở/đóng gọi GET http://{IP}/barrie?action=open|close, không ghi /parking/commands/barrie
  async executeEmergencyCommand(action) {
    this.controlView.setButtonsBusy(true);

    try {
      const resp = await this.espModel.sendBarrieAction(action);
      this.controlView.showToast(`Đã gửi lệnh ${action === 'open' ? 'MỞ' : 'ĐÓNG'} barrie tới ESP32 thành công!`, 'success');
    } catch (err) {
      // Báo lỗi rõ ràng (ví dụ: "ESP chặn CORS ở /barrie")
      this.controlView.showToast(err.message || 'Lỗi gửi lệnh tới ESP32', 'error');
    } finally {
      this.controlView.setButtonsBusy(false);
    }
  }
}
