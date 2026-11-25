"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from "recharts"
import { runBenchmark, runKdfBenchmark } from "@/lib/api"
import { downloadCsv } from "@/lib/csv"
import type { BenchmarkResult, KdfResult } from "@/lib/types"

const cipherOptions = ["AES-256-GCM", "ChaCha20-Poly1305", "DES-CBC"]
const sizeOptions = [{ label: "1 KB", value: 1 }, { label: "100 KB", value: 100 }, { label: "1 MB", value: 1024 }, { label: "10 MB", value: 10240 }]
const chartConfig = { "AES-256-GCM": { label: "AES-256-GCM", color: "var(--chart-1)" }, "ChaCha20-Poly1305": { label: "ChaCha20-Poly1305", color: "var(--chart-2)" }, "DES-CBC": { label: "DES-CBC", color: "var(--chart-3)" } }
export function BenchmarkTab() {
  const [ciphers, setCiphers] = useState<string[]>(["AES-256-GCM", "ChaCha20-Poly1305"]); const [sizes, setSizes] = useState<number[]>([1, 100, 1024, 10240]); const [runs, setRuns] = useState(10)
  const [result, setResult] = useState<BenchmarkResult | null>(null); const [kdf, setKdf] = useState<KdfResult | null>(null); const [busy, setBusy] = useState(""); const [error, setError] = useState("")
  const [deviceModel, setDeviceModel] = useState(""); const [targetSizeKb, setTargetSizeKb] = useState("1024"); const [latencyLimitMs, setLatencyLimitMs] = useState(""); const [memoryBudgetMb, setMemoryBudgetMb] = useState("")
  const toggle = (values: string[] | number[], value: string | number, setter: (next: never[]) => void) => setter((values.includes(value as never) ? values.filter((item) => item !== value) : [...values, value]) as never[])
  async function benchmark() { if (!ciphers.length || !sizes.length) { setError("Select at least one cipher and one file size."); return } setBusy("benchmark"); setError(""); try { setResult(await runBenchmark({ ciphers, sizes_kb: sizes, runs: Math.min(50, Math.max(1, Math.floor(runs) || 1)) })) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy("") } }
  async function runKdf() { setBusy("kdf"); setError(""); try { setKdf(await runKdfBenchmark()) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy("") } }
  const chartData = sizeOptions.map((size) => { const row: Record<string, string | number> = { size: size.label }; result?.results.filter((entry) => entry.size_kb === size.value).forEach((entry) => { row[entry.cipher] = entry.avg_ms }); return row })
  const deviceMeasurements = result?.results.filter((row) => row.size_kb === Number(targetSizeKb) && cipherOptions.slice(0, 2).includes(row.cipher)) ?? []
  const hasDeviceLimits = !!deviceModel.trim() && Number(latencyLimitMs) > 0 && Number(memoryBudgetMb) > 0
  const estimatedMemoryMb = (sizeKb: number) => sizeKb / 1024 * 3
  const fittingMeasurements = hasDeviceLimits ? deviceMeasurements.filter((row) => row.avg_ms <= Number(latencyLimitMs) && estimatedMemoryMb(row.size_kb) <= Number(memoryBudgetMb)) : []
  const recommended = fittingMeasurements.slice().sort((a, b) => a.avg_ms - b.avg_ms)[0]
  return <section><h2 className="text-xl font-semibold">Benchmark</h2><p className="mt-1 text-sm text-muted-foreground">Compare cipher performance across file sizes.</p>
    <div className="mt-6 flex flex-col gap-5"><fieldset><legend className="mb-2 text-sm font-medium">Ciphers</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{cipherOptions.map((cipher) => <label key={cipher} className="flex items-center gap-2 text-sm"><Checkbox checked={ciphers.includes(cipher)} onCheckedChange={() => toggle(ciphers, cipher, setCiphers as (next: never[]) => void)} />{cipher}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">File sizes</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{sizeOptions.map((size) => <label key={size.value} className="flex items-center gap-2 text-sm"><Checkbox checked={sizes.includes(size.value)} onCheckedChange={() => toggle(sizes, size.value, setSizes as (next: never[]) => void)} />{size.label}</label>)}</div></fieldset>
      <label htmlFor="benchmark-runs" className="grid max-w-36 gap-2 text-sm font-medium">Runs<Input id="benchmark-runs" type="number" min={1} max={50} value={runs} onChange={(e) => setRuns(Number(e.target.value))} /></label>
      <div className="flex flex-wrap gap-2"><Button onClick={benchmark} disabled={!!busy}>{busy === "benchmark" ? "Running benchmark…" : "Run benchmark"}</Button><Button variant="outline" disabled={!result} onClick={() => result && downloadCsv("benchmark-results.csv", [["cipher", "size_kb", "runs", "avg_ms", "min_ms", "max_ms", "throughput_mb_s"], ...result.results.map((r) => [r.cipher, String(r.size_kb), String(r.runs), String(r.avg_ms), String(r.min_ms), String(r.max_ms), String(r.throughput_mb_s)])])}>Download results as CSV</Button></div>
    </div>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {result && <div className="mt-8"><h3 className="mb-3 font-medium">Results</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cipher</TableHead><TableHead>Size</TableHead><TableHead>Avg ms</TableHead><TableHead>Min ms</TableHead><TableHead>Max ms</TableHead><TableHead>Throughput MB/s</TableHead></TableRow></TableHeader><TableBody>{result.results.map((row, index) => <TableRow key={`${row.cipher}-${row.size_kb}-${index}`}><TableCell>{row.cipher}</TableCell><TableCell>{sizeOptions.find((size) => size.value === row.size_kb)?.label || `${row.size_kb} KB`}</TableCell><TableCell>{row.avg_ms.toFixed(2)}</TableCell><TableCell>{row.min_ms.toFixed(2)}</TableCell><TableCell>{row.max_ms.toFixed(2)}</TableCell><TableCell>{row.throughput_mb_s.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table></div>
      <h3 className="mb-3 mt-8 font-medium">Average time by cipher and size</h3><ChartContainer config={chartConfig} className="h-72 w-full"> <BarChart data={chartData} accessibilityLayer><CartesianGrid vertical={false} /><XAxis dataKey="size" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Legend /><Bar dataKey="AES-256-GCM" fill="var(--color-AES-256-GCM)" radius={2} /><Bar dataKey="ChaCha20-Poly1305" fill="var(--color-ChaCha20-Poly1305)" radius={2} /><Bar dataKey="DES-CBC" fill="var(--color-DES-CBC)" radius={2} /></BarChart></ChartContainer></div>}
    <div className="mt-9 border-t pt-6">
      <h3 className="font-medium">IoT device fit recommendation</h3>
      <p className="mt-1 text-sm text-muted-foreground">Compare measured secure-cipher performance with your device’s limits.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label htmlFor="device-model" className="grid gap-2 text-sm font-medium">Device model<Input id="device-model" value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} placeholder="e.g. ESP32-S3 or Raspberry Pi Zero 2 W" /></label>
        <label htmlFor="device-payload-size" className="grid gap-2 text-sm font-medium">Payload size<select id="device-payload-size" value={targetSizeKb} onChange={(e) => setTargetSizeKb(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{sizeOptions.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}</select></label>
        <label htmlFor="device-latency-limit" className="grid gap-2 text-sm font-medium">Maximum encryption time (ms)<Input id="device-latency-limit" type="number" min="0.01" step="0.01" value={latencyLimitMs} onChange={(e) => setLatencyLimitMs(e.target.value)} placeholder="Enter your limit" /></label>
        <label htmlFor="device-memory-budget" className="grid gap-2 text-sm font-medium">Available memory budget (MB)<Input id="device-memory-budget" type="number" min="0.01" step="0.01" value={memoryBudgetMb} onChange={(e) => setMemoryBudgetMb(e.target.value)} placeholder="Enter your limit" /></label>
      </div>
      <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
        {!hasDeviceLimits ? <p>Enter a device model and both limits to see a recommendation.</p> : !result ? <p>Run the benchmark for {sizeOptions.find((size) => size.value === Number(targetSizeKb))?.label} to assess this device.</p> : deviceMeasurements.length === 0 ? <p>No secure-cipher measurements for this payload size. Select the size above and run the benchmark.</p> : recommended ? <p><span className="font-medium">Best measured fit for {deviceModel}:</span> {recommended.cipher} at {recommended.avg_ms.toFixed(2)} ms. It meets the {Number(latencyLimitMs).toLocaleString()} ms time limit and the estimated {estimatedMemoryMb(recommended.size_kb).toFixed(2)} MB payload-buffer budget.</p> : <p>No measured secure cipher meets both limits for this payload size. DES-CBC is excluded from recommendations because it is a legacy benchmark baseline.</p>}
        {hasDeviceLimits && deviceMeasurements.length > 0 && <div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Secure cipher</TableHead><TableHead>Measured time</TableHead><TableHead>Estimated payload memory</TableHead><TableHead>Fit</TableHead></TableRow></TableHeader><TableBody>{deviceMeasurements.map((row) => { const memory = estimatedMemoryMb(row.size_kb); const fits = row.avg_ms <= Number(latencyLimitMs) && memory <= Number(memoryBudgetMb); return <TableRow key={`${row.cipher}-${row.size_kb}`}><TableCell>{row.cipher}</TableCell><TableCell>{row.avg_ms.toFixed(2)} ms</TableCell><TableCell>≈ {memory.toFixed(2)} MB</TableCell><TableCell>{fits ? "Within limits" : "Over limit"}</TableCell></TableRow> })}</TableBody></Table></div>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">The benchmark runs on the machine hosting the API. For device-specific results, run the backend on the target device and point the frontend to it. Memory is an estimate of roughly 3× payload size for this full-buffer implementation; runtime overhead and power use are not measured. DES is never recommended for file protection.</p>
    </div>
    <div className="mt-9 border-t pt-6"><h3 className="font-medium">Password guessing cost</h3><p className="mt-1 text-sm text-muted-foreground">Compare guessing rates for SHA-256 and scrypt.</p><Button className="mt-4" variant="outline" onClick={runKdf} disabled={!!busy}>{busy === "kdf" ? "Running…" : "Run"}</Button>{kdf && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">SHA-256 guesses/sec</dt><dd>{kdf.sha256_guesses_per_sec.toLocaleString()}</dd></div><div><dt className="text-muted-foreground">scrypt guesses/sec</dt><dd>{kdf.scrypt_guesses_per_sec.toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Slowdown ratio</dt><dd>{kdf.slowdown_ratio.toLocaleString()}×</dd></div></dl>}</div>
  </section>
}
