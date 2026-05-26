import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  // Envía la cookie httpOnly `dv_token` automáticamente; el JS nunca la lee
  withCredentials: true,
});

export default api;
