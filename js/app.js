/**
 * ============================================================================
 * SMART PARKING - BOOTSTRAP APP (MVC DEPENDENCY INJECTION)
 * ============================================================================
 * - app.js chỉ khởi tạo và gắn dependency giữa Models, Views, Controllers.
 * - Kết nối trực tiếp ESP32 qua IP LAN (200ms poll), Firebase chỉ là phụ.
 */

import { pinService } from './services/pinService.js';
import { ParkingModel } from './models/parkingModel.js';
import { EspModel } from './models/espModel.js';
import { FirebaseModel } from './models/firebaseModel.js';

import { DashboardView } from './views/dashboardView.js';
import { LogView } from './views/logView.js';
import { ControlView } from './views/controlView.js';

import { DashboardController } from './controllers/dashboardController.js';
import { GateController } from './controllers/gateController.js';

window.addEventListener('DOMContentLoaded', async () => {
  // 1. Khởi tạo Services & Models
  await pinService.init();
  const parkingModel = new ParkingModel();
  const espModel = new EspModel();
  const firebaseModel = new FirebaseModel();

  // 2. Khởi tạo Views
  const dashboardView = new DashboardView();
  const logView = new LogView();
  const controlView = new ControlView();

  // 3. Khởi tạo Controllers và gắn kết các dependency
  const dashboardController = new DashboardController({
    parkingModel,
    espModel,
    firebaseModel,
    dashboardView,
    logView,
    controlView
  });

  const gateController = new GateController({
    pinService,
    espModel,
    controlView
  });

  console.log('Hệ thống Nhà xe thông minh đã sẵn sàng (Kết nối trực tiếp ESP32 qua IP).');
});
