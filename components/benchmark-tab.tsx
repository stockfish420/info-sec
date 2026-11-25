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
  const toggle = (values: string[] | number[], value: string | number, setter: (next: never[]) => void) => setter((values.includes(value as never) ? values.filter((item) => item !== value) : [...values, value]) as never[])
  async function benchmark() { if (!ciphers.length || !sizes.length) { setError("Select at least one cipher and one file size."); return } setBusy("benchmark"); setError(""); try { setResult(await runBenchmark({ ciphers, sizes_kb: sizes, runs: Math.max(1, runs) })) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy("") } }
  async function runKdf() { setBusy("kdf"); setError(""); try { setKdf(await runKdfBenchmark()) } catch (e) { setError(e instanceof Error ? e.message : "Request failed.") } finally { setBusy("") } }
  const chartData = sizeOptions.map((size) => { const row: Record<string, string | number> = { size: size.label }; result?.results.filter((entry) => entry.size_kb === size.value).forEach((entry) => { row[entry.cipher] = entry.avg_ms }); return row })
  return <section><h2 className="text-xl font-semibold">Benchmark</h2><p className="mt-1 text-sm text-muted-foreground">Compare cipher performance across file sizes.</p>
    <div className="mt-6 flex flex-col gap-5"><fieldset><legend className="mb-2 text-sm font-medium">Ciphers</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{cipherOptions.map((cipher) => <label key={cipher} className="flex items-center gap-2 text-sm"><Checkbox checked={ciphers.includes(cipher)} onCheckedChange={() => toggle(ciphers, cipher, setCiphers as (next: never[]) => void)} />{cipher}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">File sizes</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{sizeOptions.map((size) => <label key={size.value} className="flex items-center gap-2 text-sm"><Checkbox checked={sizes.includes(size.value)} onCheckedChange={() => toggle(sizes, size.value, setSizes as (next: never[]) => void)} />{size.label}</label>)}</div></fieldset>
      <label htmlFor="benchmark-runs" className="grid max-w-36 gap-2 text-sm font-medium">Runs<Input id="benchmark-runs" type="number" min={1} max={1000} value={runs} onChange={(e) => setRuns(Number(e.target.value))} /></label>
      <div className="flex flex-wrap gap-2"><Button onClick={benchmark} disabled={!!busy}>{busy === "benchmark" ? "Running benchmark…" : "Run benchmark"}</Button><Button variant="outline" disabled={!result} onClick={() => result && downloadCsv("benchmark-results.csv", [["cipher", "size_kb", "runs", "avg_ms", "min_ms", "max_ms", "throughput_mb_s"], ...result.results.map((r) => [r.cipher, String(r.size_kb), String(r.runs), String(r.avg_ms), String(r.min_ms), String(r.max_ms), String(r.throughput_mb_s)])])}>Download results as CSV</Button></div>
    </div>
    {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
    {result && <div className="mt-8"><h3 className="mb-3 font-medium">Results</h3><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cipher</TableHead><TableHead>Size</TableHead><TableHead>Avg ms</TableHead><TableHead>Min ms</TableHead><TableHead>Max ms</TableHead><TableHead>Throughput MB/s</TableHead></TableRow></TableHeader><TableBody>{result.results.map((row, index) => <TableRow key={`${row.cipher}-${row.size_kb}-${index}`}><TableCell>{row.cipher}</TableCell><TableCell>{sizeOptions.find((size) => size.value === row.size_kb)?.label || `${row.size_kb} KB`}</TableCell><TableCell>{row.avg_ms.toFixed(2)}</TableCell><TableCell>{row.min_ms.toFixed(2)}</TableCell><TableCell>{row.max_ms.toFixed(2)}</TableCell><TableCell>{row.throughput_mb_s.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table></div>
      <h3 className="mb-3 mt-8 font-medium">Average time by cipher and size</h3><ChartContainer config={chartConfig} className="h-72 w-full"> <BarChart data={chartData} accessibilityLayer><CartesianGrid vertical={false} /><XAxis dataKey="size" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Legend /><Bar dataKey="AES-256-GCM" fill="var(--color-AES-256-GCM)" radius={2} /><Bar dataKey="ChaCha20-Poly1305" fill="var(--color-ChaCha20-Poly1305)" radius={2} /><Bar dataKey="DES-CBC" fill="var(--color-DES-CBC)" radius={2} /></BarChart></ChartContainer></div>}
    <div className="mt-9 border-t pt-6"><h3 className="font-medium">Password guessing cost</h3><p className="mt-1 text-sm text-muted-foreground">Compare guessing rates for SHA-256 and scrypt.</p><Button className="mt-4" variant="outline" onClick={runKdf} disabled={!!busy}>{busy === "kdf" ? "Running…" : "Run"}</Button>{kdf && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">SHA-256 guesses/sec</dt><dd>{kdf.sha256_guesses_per_sec.toLocaleString()}</dd></div><div><dt className="text-muted-foreground">scrypt guesses/sec</dt><dd>{kdf.scrypt_guesses_per_sec.toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Slowdown ratio</dt><dd>{kdf.slowdown_ratio.toLocaleString()}×</dd></div></dl>}</div>
  </section>
}
