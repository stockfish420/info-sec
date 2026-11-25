"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { encryptFile, decryptFile, downloadFile } from "@/lib/api"
import type { DecryptResult, EncryptResult } from "@/lib/types"
import { formatBytes, saveDownload } from "@/lib/csv"

export function VaultTab() {
  const [file, setFile] = useState<File | null>(null); const [password, setPassword] = useState(""); const [cipher, setCipher] = useState("AES-256-GCM")
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [result, setResult] = useState<EncryptResult | DecryptResult | null>(null)
  async function run(operation: "encrypt" | "decrypt") {
    if (!file || !password) { setError("Choose a file and enter a password."); return }
    setBusy(operation); setError(""); setResult(null)
    try { setResult(operation === "encrypt" ? await encryptFile(file, password, cipher) : await decryptFile(file, password)) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy("") }
  }
  const succeeded = result && ("status" in result ? result.status === "ok" : true)
  const fileId = result && ("file_id" in result ? result.file_id : undefined)
  const filename = result && ("filename" in result ? result.filename : undefined)
  return <section className="max-w-2xl">
    <h2 className="text-xl font-semibold">Vault</h2><p className="mt-1 text-sm text-muted-foreground">Encrypt or decrypt a file using a password-derived key.</p>
    <div className="mt-6 flex flex-col gap-4">
      <label className="grid gap-2 text-sm font-medium" htmlFor="vault-file">File<input id="vault-file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-4 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm" /></label>
      <label className="grid gap-2 text-sm font-medium" htmlFor="vault-password">Password<Input id="vault-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="grid gap-2 text-sm font-medium" htmlFor="vault-cipher">Cipher<select id="vault-cipher" value={cipher} onChange={(e) => setCipher(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option>AES-256-GCM</option><option>ChaCha20-Poly1305</option></select></label>
      <div className="flex flex-wrap gap-2"><Button onClick={() => run("encrypt")} disabled={!!busy}>{busy === "encrypt" ? "Encrypting…" : "Encrypt"}</Button><Button variant="outline" onClick={() => run("decrypt")} disabled={!!busy}>{busy === "decrypt" ? "Decrypting…" : "Decrypt"}</Button></div>
    </div>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {result && <div className="mt-7 border-t pt-5"><h3 className="font-medium">Result</h3>{"status" in result && result.status === "auth_failed" ? <p className="mt-3 text-sm text-red-600">Authentication failed: wrong password or file was modified.</p> : <><p className="mt-3 text-sm">Status: {succeeded ? "Success" : "Failed"}</p><dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">{"cipher" in result && <><dt className="text-muted-foreground">Cipher</dt><dd>{result.cipher}</dd></>}{[["Input size", formatBytes(result.input_bytes)], ["Output size", "output_bytes" in result && result.output_bytes !== undefined ? formatBytes(result.output_bytes) : "—"], ["KDF time", `${result.kdf_ms.toFixed(2)} ms`], ["Cipher time", `${result.cipher_ms.toFixed(2)} ms`], ["Total time", `${result.total_ms.toFixed(2)} ms`], ["Throughput", "throughput_mb_s" in result && result.throughput_mb_s !== undefined ? `${result.throughput_mb_s.toFixed(2)} MB/s` : "—"]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5">{value}</dd></div>)}</dl>{fileId && <Button className="mt-4" variant="link" onClick={() => saveDownload(fileId, filename || "securevault-download", downloadFile)}>Download {filename || "file"}</Button>}</>}</div>}
  </section>
}
