/**
 * ============================================================================
 * FIREBASE MODEL - KẾT NỐI VÀ THAO TÁC FIREBASE REALTIME DATABASE
 * ============================================================================
 * - Sử dụng firebase-app-compat và firebase-database-compat từ CDN
 * - Mọi máy, mọi mạng chỉ sử dụng Firebase Realtime Database
 * - Cấu hình lưu trữ trong localStorage
 * - Không can thiệp DOM.
 */

const STORAGE_KEY_CONFIG = 'parking_firebase_config';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDemoProjectKeyPlaceholder_12345',
  authDomain: 'nhaxethongminhdatabase.firebaseapp.com',
  databaseURL: 'https://nhaxethongminhdatabase-default-rtdb.firebaseio.com',
  projectId: 'nhaxethongminhdatabase'
};

export class FirebaseModel {
  constructor() {
    this.db = null;
    this.config = this.loadConfig();
    this.init();
  }

  loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Cập nhật sang databaseURL mới nếu config cũ còn lưu URL demo cũ
        if (!parsed.databaseURL || parsed.databaseURL.includes('nhaxethongminh-demo')) {
          parsed.databaseURL = DEFAULT_FIREBASE_CONFIG.databaseURL;
        }
        return { ...DEFAULT_FIREBASE_CONFIG, ...parsed };
      } catch (e) {
        return { ...DEFAULT_FIREBASE_CONFIG };
      }
    }
    return { ...DEFAULT_FIREBASE_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
    this.init();
  }

  getConfig() {
    return { ...this.config };
  }

  init() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK compat chưa được tải');
        return;
      }

      if (firebase.apps && firebase.apps.length > 0) {
        firebase.app().delete();
      }

      firebase.initializeApp(this.config);
      this.db = firebase.database();
    } catch (err) {
      console.warn('Lỗi khởi tạo Firebase:', err);
    }
  }

  // Lắng nghe trạng thái kết nối tới Firebase server
  listenConnection(callback) {
    if (!this.db) return;
    this.db.ref('.info/connected').on('value', (snapshot) => {
      callback(Boolean(snapshot.val()));
    });
  }

  // onValue /parking/state để vẽ số xe và barrie
  listenState(callback) {
    if (!this.db) return;
    this.db.ref('parking/state').on('value', (snapshot) => {
      callback(snapshot.val());
    });
  }

  // onValue /parking/events để vẽ nhật ký (50 sự kiện gần nhất)
  listenEvents(limit = 50, callback) {
    if (!this.db) return;
    this.db.ref('parking/events')
      .limitToLast(limit)
      .on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          callback([]);
          return;
        }
        const list = Object.keys(data).map((key) => ({
          id: key,
          ...data[key]
        }));
        // Mới nhất lên đầu
        list.sort((a, b) => (b.at || 0) - (a.at || 0));
        callback(list);
      });
  }

  // Nút mở/đóng chỉ ghi /parking/commands/barrie
  async setBarrieCommand(action) {
    if (!this.db) throw new Error('Firebase chưa được khởi tạo');
    const payload = {
      action: action, // "open" | "close"
      at: firebase.database.ServerValue.TIMESTAMP
    };
    return this.db.ref('parking/commands/barrie').set(payload);
  }

  // Đẩy sự kiện vao/ra lên /parking/events chạy nền
  async pushEvent(eventData) {
    if (!this.db || !eventData) return null;
    try {
      const payload = {
        type: eventData.type, // "vao" | "ra"
        cars: Number(eventData.cars),
        max: Number(eventData.max || 5),
        at: firebase.database.ServerValue.TIMESTAMP,
        source: (eventData.source || 'ESP').toUpperCase()
      };
      return await this.db.ref('parking/events').push(payload);
    } catch (e) {
      // Bỏ qua lỗi hoặc chưa có config
      return null;
    }
  }

  // Đồng bộ trạng thái xe chạy nền lên /parking/state
  async syncState(state) {
    if (!this.db || !state) return null;
    try {
      return await this.db.ref('parking/state').set({
        cars: Number(state.cars || 0),
        max: Number(state.max || 5),
        status: state.status || (state.cars >= (state.max || 5) ? 'FULL SLOT' : 'CON SLOT'),
        barrie: state.barrie || 'DONG',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (e) {
      // Bỏ qua lỗi hoặc chưa có config
      return null;
    }
  }
}
