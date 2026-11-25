"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isMockMode, checkHealth } from "@/lib/api"
import type { HealthResult } from "@/lib/types"
import { VaultTab } from "@/components/vault-tab"
import { TamperTab } from "@/components/tamper-tab"
import { BenchmarkTab } from "@/components/benchmark-tab"
import { MetricsTab } from "@/components/metrics-tab"

export default function Page() {
  const [backend, setBackend] = useState<"checking" | "connected" | "unreachable">("checking")
  useEffect(() => {
    if (isMockMode) { setBackend("connected"); return }
    checkHealth().then((result: HealthResult) => setBackend(result.status === "ok" ? "connected" : "unreachable")).catch(() => setBackend("unreachable"))
  }, [])
  const label = isMockMode ? "Backend: mock mode" : backend === "checking" ? "Backend: checking…" : backend === "connected" ? "Backend: connected" : "Backend: unreachable"
  return <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-5">
      <h1 className="text-2xl font-semibold tracking-tight">SecureVault</h1>
      <p className="text-sm text-muted-foreground" role="status">{label}</p>
    </header>
    <Tabs defaultValue="vault" className="w-full">
      <TabsList className="mb-7 grid h-auto w-full grid-cols-2 sm:grid-cols-4">
        <TabsTrigger value="vault">Vault</TabsTrigger><TabsTrigger value="tamper">Tamper Test</TabsTrigger><TabsTrigger value="benchmark">Benchmark</TabsTrigger><TabsTrigger value="metrics">Metrics Log</TabsTrigger>
      </TabsList>
      <TabsContent value="vault"><VaultTab /></TabsContent>
      <TabsContent value="tamper"><TamperTab /></TabsContent>
      <TabsContent value="benchmark"><BenchmarkTab /></TabsContent>
      <TabsContent value="metrics"><MetricsTab /></TabsContent>
    </Tabs>
  </main>
}
