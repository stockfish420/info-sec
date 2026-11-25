"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { clearMetrics, getMetrics } from "@/lib/api"
import { downloadCsv, formatBytes } from "@/lib/csv"
import type { MetricsResult } from "@/lib/types"

export function MetricsTab() {
  const [data, setData] = useState<MetricsResult | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("")
  const refresh = useCallback(async () => { setBusy(true); setError(""); try { setData(await getMetrics()) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy(false) } }, [])
  useEffect(() => { void refresh() }, [refresh])
  async function clear() { if (!window.confirm("Clear the metrics log? This cannot be undone.")) return; setBusy(true); setError(""); try { await clearMetrics(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); setBusy(false) } }
  const summary = data?.summary
  return <section><h2 className="text-xl font-semibold">Metrics Log</h2><p className="mt-1 text-sm text-muted-foreground">Review recent encryption and decryption operations.</p>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    <dl className="my-6 grid grid-cols-2 gap-5 border-y py-5 sm:grid-cols-4">{[["Total operations", summary?.total_ops ?? "—"], ["Avg encrypt time", summary ? `${summary.avg_encrypt_ms.toFixed(2)} ms` : "—"], ["Avg decrypt time", summary ? `${summary.avg_decrypt_ms.toFixed(2)} ms` : "—"], ["Tamper/auth failures", summary?.auth_failures ?? "—"]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}</dl>
    <div className="mb-4 flex flex-wrap gap-2"><Button variant="outline" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</Button><Button variant="outline" disabled={!data?.entries.length} onClick={() => data && downloadCsv("securevault-metrics.csv", [["time", "operation", "cipher", "size_bytes", "duration_ms", "status"], ...data.entries.map((entry) => [entry.timestamp, entry.operation, entry.cipher, String(entry.size_bytes), String(entry.duration_ms), entry.status])])}>Download as CSV</Button><Button variant="destructive" onClick={clear} disabled={busy}>Clear log</Button></div>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Operation</TableHead><TableHead>Cipher</TableHead><TableHead>Size</TableHead><TableHead>Duration ms</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data?.entries.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((entry) => <TableRow key={entry.id}><TableCell>{new Date(entry.timestamp).toLocaleString()}</TableCell><TableCell>{entry.operation}</TableCell><TableCell>{entry.cipher}</TableCell><TableCell>{formatBytes(entry.size_bytes)}</TableCell><TableCell>{entry.duration_ms.toFixed(2)}</TableCell><TableCell>{entry.status}</TableCell></TableRow>)}</TableBody></Table>{data && data.entries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No logged operations.</p>}</div>
  </section>
}
