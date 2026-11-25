export type Cipher = "AES-256-GCM" | "ChaCha20-Poly1305" | "DES-CBC"

export type EncryptResult = {
  file_id: string; filename: string; cipher: string; input_bytes: number; output_bytes: number
  kdf_ms: number; cipher_ms: number; total_ms: number; throughput_mb_s: number
}
export type DecryptResult = {
  status: "ok" | "auth_failed"; file_id?: string; filename?: string; cipher?: string
  input_bytes: number; output_bytes?: number; kdf_ms: number; cipher_ms: number
  total_ms: number; throughput_mb_s?: number; reason?: string
}
export type TamperResult = { file_id: string; filename: string; flipped_byte_index: number }
export type BenchmarkRow = { cipher: string; size_kb: number; runs: number; avg_ms: number; min_ms: number; max_ms: number; throughput_mb_s: number }
export type BenchmarkResult = { ran_at: string; results: BenchmarkRow[] }
export type KdfResult = { sha256_guesses_per_sec: number; scrypt_guesses_per_sec: number; slowdown_ratio: number }
export type MetricEntry = { id: string; timestamp: string; operation: string; cipher: string; size_bytes: number; duration_ms: number; status: string }
export type MetricsResult = { summary: { total_ops: number; avg_encrypt_ms: number; avg_decrypt_ms: number; auth_failures: number }; entries: MetricEntry[] }
export type HealthResult = { status: "ok" }
export type CipherChoice = "AES-256-GCM" | "ChaCha20-Poly1305"
export type DownloadResult = { blob: Blob; filename: string }
export type BenchmarkRequest = { ciphers: string[]; sizes_kb: number[]; runs: number }
