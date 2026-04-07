// frontend/src/apiConfig.js

// Priority:
// 1) Explicit build-time override (used by desktop packaging)
// 2) Web production relative API
// 3) Local dev backend
const API_URL = process.env.REACT_APP_API_URL || (
  process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5000'
);

export default API_URL;