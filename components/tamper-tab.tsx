"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { tamperFile, downloadFile } from "@/lib/api"
import { saveDownload } from "@/lib/csv"
import type { TamperResult } from "@/lib/types"

export function TamperTab() {
  const [file, setFile] = useState<File | null>(null); const [result, setResult] = useState<TamperResult | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("")
  async function submit() { if (!file) { setError("Choose an encrypted .vault file."); return } setBusy(true); setError(""); setResult(null); try { setResult(await tamperFile(file)) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy(false) } }
  return <section className="max-w-2xl"><h2 className="text-xl font-semibold">Tamper Test</h2><p className="mt-1 text-sm text-muted-foreground">Modify one byte in an encrypted file to test authentication.</p>
    <div className="mt-6 flex flex-col items-start gap-4"><label htmlFor="tamper-file" className="grid w-full gap-2 text-sm font-medium">Encrypted .vault file<input id="tamper-file" type="file" accept=".vault,application/octet-stream" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-4 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1" /></label><Button onClick={submit} disabled={busy}>{busy ? "Tampering…" : "Flip one random byte"}</Button></div>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}{result && <div className="mt-7 border-t pt-5"><h3 className="font-medium">Tamper result</h3><p className="mt-3 text-sm">Flipped byte position: {result.flipped_byte_index}</p><Button variant="link" className="px-0" onClick={() => saveDownload(result.file_id, result.filename, downloadFile)}>Download modified file: {result.filename}</Button><p className="mt-3 text-sm">Now decrypt the modified file in the Vault tab. It should fail.</p></div>}
  </section>
}
