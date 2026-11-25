import type { BenchmarkRequest, BenchmarkResult, DecryptResult, DownloadResult, EncryptResult, HealthResult, KdfResult, MetricsResult, SystemInfoResult, TamperResult } from "@/lib/types"

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "")
export const isMockMode = (process.env.NEXT_PUBLIC_USE_MOCK ?? "true") === "true"
const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms))
const mockId = () => `mock-${Math.random().toString(36).slice(2, 10)}`
let mockMetrics: MetricsResult | null = null

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json() as Promise<T>
}
function formData(file: File, fields: Record<string, string> = {}) {
  const data = new FormData(); data.append("file", file)
  Object.entries(fields).forEach(([key, value]) => data.append(key, value))
  return data
}

export async function checkHealth(): Promise<HealthResult> {
  if (isMockMode) { await delay(); return { status: "ok" } }
  return request("/api/health")
}
export async function getSystemInfo(): Promise<SystemInfoResult> {
  if (isMockMode) {
    await delay()
    return { system: "Mock mode", architecture: "Browser", processor: "Not detected", logical_cpu_count: null, effective_cpu_cores: null, cpu_source: "mock mode", memory_total_mb: null, memory_available_mb: null, memory_source: "not detected in mock mode", scrypt_ms: 0, scrypt_memory_mb: 32, runtime: "Mock API" }
  }
  return request("/api/system-info")
}
export async function encryptFile(file: File, password: string, cipher: string): Promise<EncryptResult> {
  if (isMockMode) { await delay(); const input = file.size; return { file_id: mockId(), filename: `${file.name}.vault`, cipher, input_bytes: input, output_bytes: input + 64, kdf_ms: 82.4, cipher_ms: 3.8, total_ms: 86.2, throughput_mb_s: Number((input / 1048576 / .0038).toFixed(2)) } }
  return request("/api/encrypt", { method: "POST", body: formData(file, { password, cipher }) })
}
export async function decryptFile(file: File, password: string): Promise<DecryptResult> {
  if (isMockMode) { await delay(); const ok = !file.name.toLowerCase().includes("tampered") && password.length > 0; return ok ? { status: "ok", file_id: mockId(), filename: file.name.replace(/\.vault$/i, "") || "decrypted-file", cipher: "AES-256-GCM", input_bytes: file.size, output_bytes: Math.max(0, file.size - 64), kdf_ms: 81.7, cipher_ms: 3.2, total_ms: 84.9, throughput_mb_s: 2.14 } : { status: "auth_failed", input_bytes: file.size, kdf_ms: 80.1, cipher_ms: 1.2, total_ms: 81.3, reason: "Authentication failed" } }
  return request("/api/decrypt", { method: "POST", body: formData(file, { password }) })
}
export async function tamperFile(file: File): Promise<TamperResult> {
  if (isMockMode) { await delay(); return { file_id: mockId(), filename: `${file.name.replace(/\.vault$/i, "")}-tampered.vault`, flipped_byte_index: Math.floor(Math.random() * Math.max(file.size, 1)) } }
  return request("/api/tamper", { method: "POST", body: formData(file) })
}
export async function runBenchmark(body: BenchmarkRequest): Promise<BenchmarkResult> {
  if (isMockMode) { await delay(); return { ran_at: new Date().toISOString(), results: body.ciphers.flatMap((cipher) => body.sizes_kb.map((size_kb) => { const avg_ms = Number((0.4 + size_kb / (cipher === "DES-CBC" ? 82 : cipher.startsWith("AES") ? 165 : 145)).toFixed(2)); return { cipher, size_kb, runs: body.runs, avg_ms, min_ms: Number((avg_ms * .89).toFixed(2)), max_ms: Number((avg_ms * 1.16).toFixed(2)), throughput_mb_s: Number((size_kb / 1024 / (avg_ms / 1000)).toFixed(2)) } })) } }
  return request("/api/benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}
export async function runKdfBenchmark(): Promise<KdfResult> {
  if (isMockMode) { await delay(); return { sha256_guesses_per_sec: 12840000, scrypt_guesses_per_sec: 42, slowdown_ratio: 305714.29 } }
  return request("/api/kdf-benchmark", { method: "POST" })
}
export async function getMetrics(): Promise<MetricsResult> {
  if (isMockMode) {
    await delay()
    if (!mockMetrics) {
      const now = Date.now()
      const entries = Array.from({ length: 8 }, (_, index) => ({ id: `entry-${index}`, timestamp: new Date(now - index * 3600000).toISOString(), operation: index % 3 === 0 ? "decrypt" : "encrypt", cipher: index % 2 ? "ChaCha20-Poly1305" : "AES-256-GCM", size_bytes: [1024, 102400, 1048576, 10485760][index % 4], duration_ms: Number((21.4 + index * 8.3).toFixed(1)), status: index === 5 ? "auth_failed" : "ok" }))
      mockMetrics = { summary: { total_ops: 42, avg_encrypt_ms: 31.8, avg_decrypt_ms: 28.6, auth_failures: 3 }, entries }
    }
    return mockMetrics
  }
  return request("/api/metrics")
}
export async function clearMetrics(): Promise<void> {
  if (isMockMode) {
    await delay()
    mockMetrics = { summary: { total_ops: 0, avg_encrypt_ms: 0, avg_decrypt_ms: 0, auth_failures: 0 }, entries: [] }
    return
  }
  const response = await fetch(`${baseUrl}/api/metrics`, { method: "DELETE" })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
}
export async function downloadFile(fileId: string, fallbackName: string): Promise<DownloadResult> {
  if (isMockMode) { await delay(); return { blob: new Blob([`SecureVault demo download: ${fallbackName}\nFile ID: ${fileId}\n`], { type: "application/octet-stream" }), filename: fallbackName } }
  const response = await fetch(`${baseUrl}/api/download/${encodeURIComponent(fileId)}`)
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  const disposition = response.headers.get("content-disposition")
  const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName
  return { blob: await response.blob(), filename }
}
