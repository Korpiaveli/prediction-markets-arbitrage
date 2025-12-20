"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Settings, Save, RefreshCw, Server, Bell, Shield, Zap } from "lucide-react"
import Link from "next/link"

interface ScannerConfig {
  scanInterval: number
  minProfit: number
  maxMarkets: number
  exchanges: {
    kalshi: boolean
    polymarket: boolean
    predictit: boolean
  }
  alerts: {
    enabled: boolean
    minProfitAlert: number
    soundEnabled: boolean
  }
  riskLimits: {
    maxPositionSize: number
    maxDailyLoss: number
    minResolutionScore: number
  }
}

const defaultConfig: ScannerConfig = {
  scanInterval: 30,
  minProfit: 0.5,
  maxMarkets: 100,
  exchanges: {
    kalshi: true,
    polymarket: true,
    predictit: true
  },
  alerts: {
    enabled: true,
    minProfitAlert: 2.0,
    soundEnabled: false
  },
  riskLimits: {
    maxPositionSize: 1000,
    maxDailyLoss: 500,
    minResolutionScore: 60
  }
}

export default function SettingsPage() {
  const [config, setConfig] = useState<ScannerConfig>(defaultConfig)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    const savedConfig = localStorage.getItem('scanner-config')
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig))
      } catch {}
    }
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      localStorage.setItem('scanner-config', JSON.stringify(config))
      setSaveMessage('Settings saved successfully')
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error) {
      setSaveMessage('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setConfig(defaultConfig)
    localStorage.removeItem('scanner-config')
    setSaveMessage('Settings reset to defaults')
    setTimeout(() => setSaveMessage(null), 3000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            </div>
            <Link href="/">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Scanner Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Scanner Settings
              </CardTitle>
              <CardDescription>Configure how the arbitrage scanner operates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Scan Interval (seconds)
                  </label>
                  <Input
                    type="number"
                    value={config.scanInterval}
                    onChange={(e) => setConfig({ ...config, scanInterval: Number(e.target.value) })}
                    min={5}
                    max={300}
                  />
                  <p className="text-xs text-muted-foreground mt-1">How often to scan for opportunities</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Profit (%)
                  </label>
                  <Input
                    type="number"
                    value={config.minProfit}
                    onChange={(e) => setConfig({ ...config, minProfit: Number(e.target.value) })}
                    min={0}
                    max={50}
                    step={0.1}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum profit to show</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Markets
                  </label>
                  <Input
                    type="number"
                    value={config.maxMarkets}
                    onChange={(e) => setConfig({ ...config, maxMarkets: Number(e.target.value) })}
                    min={10}
                    max={500}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Markets per exchange to scan</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Exchange Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Exchange Settings
              </CardTitle>
              <CardDescription>Enable or disable specific exchanges</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge>KALSHI</Badge>
                    <span className="text-sm text-muted-foreground">CFTC-regulated exchange</span>
                  </div>
                  <Switch
                    checked={config.exchanges.kalshi}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        exchanges: { ...config.exchanges, kalshi: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge>POLYMARKET</Badge>
                    <span className="text-sm text-muted-foreground">Crypto prediction market</span>
                  </div>
                  <Switch
                    checked={config.exchanges.polymarket}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        exchanges: { ...config.exchanges, polymarket: checked }
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge>PREDICTIT</Badge>
                    <span className="text-sm text-muted-foreground">Political prediction market</span>
                  </div>
                  <Switch
                    checked={config.exchanges.predictit}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        exchanges: { ...config.exchanges, predictit: checked }
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alert Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alert Settings
              </CardTitle>
              <CardDescription>Configure notifications for high-profit opportunities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Alerts</p>
                  <p className="text-sm text-muted-foreground">Show notifications for opportunities</p>
                </div>
                <Switch
                  checked={config.alerts.enabled}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      alerts: { ...config.alerts, enabled: checked }
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sound Alerts</p>
                  <p className="text-sm text-muted-foreground">Play sound for high-profit opportunities</p>
                </div>
                <Switch
                  checked={config.alerts.soundEnabled}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      alerts: { ...config.alerts, soundEnabled: checked }
                    })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Profit for Alert (%)
                </label>
                <Input
                  type="number"
                  value={config.alerts.minProfitAlert}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      alerts: { ...config.alerts, minProfitAlert: Number(e.target.value) }
                    })
                  }
                  min={0}
                  max={50}
                  step={0.5}
                  className="max-w-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Risk Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Limits
              </CardTitle>
              <CardDescription>Set limits to manage your trading risk</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Position Size ($)
                  </label>
                  <Input
                    type="number"
                    value={config.riskLimits.maxPositionSize}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        riskLimits: { ...config.riskLimits, maxPositionSize: Number(e.target.value) }
                      })
                    }
                    min={10}
                    max={100000}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Daily Loss ($)
                  </label>
                  <Input
                    type="number"
                    value={config.riskLimits.maxDailyLoss}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        riskLimits: { ...config.riskLimits, maxDailyLoss: Number(e.target.value) }
                      })
                    }
                    min={0}
                    max={10000}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Resolution Score
                  </label>
                  <Input
                    type="number"
                    value={config.riskLimits.minResolutionScore}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        riskLimits: { ...config.riskLimits, minResolutionScore: Number(e.target.value) }
                      })
                    }
                    min={0}
                    max={100}
                  />
                  <p className="text-xs text-muted-foreground mt-1">0-100 scale</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>

            <div className="flex items-center gap-4">
              {saveMessage && (
                <span className={saveMessage.includes('success') ? 'text-green-600' : 'text-red-600'}>
                  {saveMessage}
                </span>
              )}
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
