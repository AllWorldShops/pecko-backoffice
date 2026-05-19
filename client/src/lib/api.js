import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

let isRefreshing = false
let failedQueue = []

function processQueue(error) {
  failedQueue.forEach(prom => (error ? prom.reject(error) : prom.resolve()))
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    // Never intercept auth routes — /auth/me and /auth/refresh are expected to
    // return 401 for unauthenticated users. Intercepting them causes a deadlock:
    // the refresh call itself gets a 401, which queues behind processQueue, which
    // is waiting for the refresh call to finish → hangs forever.
    if (original.url?.includes('/auth/')) {
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then(() => api(original))
          .catch(e => Promise.reject(e))
      }
      original._retry = true
      isRefreshing = true
      try {
        await api.post('/auth/refresh')
        processQueue(null)
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr)
        window.location.href = '/login?expired=1'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
