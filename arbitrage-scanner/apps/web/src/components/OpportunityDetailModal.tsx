"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArbitrageOpportunity, ResolutionAlignment } from "@/types"
import { format } from "date-fns"
import { ExternalLink, AlertTriangle, CheckCircle, XCircle, Clock, TrendingUp, Shield, DollarSign } from "lucide-react"

interface OpportunityDetailModalProps {
  opportunity: ArbitrageOpportunity | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getRiskBadgeVariant(level: string | undefined): "success" | "warning" | "danger" | "default" {
  switch (level) {
    case 'EXCELLENT':
    case 'GOOD':
      return 'success'
    case 'FAIR':
      return 'warning'
    case 'POOR':
    case 'CRITICAL':
      return 'danger'
    default:
      return 'default'
  }
}

function formatDirection(direction: string): { exchange1Action: string; exchange2Action: string } {
  if (direction.includes('YES') && direction.includes('NO')) {
    const parts = direction.split('_')
    const exchange1Action = parts.includes('EXCHANGE1_YES') || parts.includes('KALSHI_YES') ? 'BUY YES' : 'BUY NO'
    const exchange2Action = parts.includes('EXCHANGE2_NO') || parts.includes('POLY_NO') ? 'BUY NO' : 'BUY YES'
    return { exchange1Action, exchange2Action }
  }
  return { exchange1Action: 'BUY YES', exchange2Action: 'BUY NO' }
}

export function OpportunityDetailModal({ opportunity, open, onOpenChange }: OpportunityDetailModalProps) {
  if (!opportunity) return null

  const pair = opportunity.marketPair || opportunity.pair
  const resolution = opportunity.resolutionAlignment || opportunity.resolution
  const actions = formatDirection(opportunity.direction)

  const market1 = pair?.market1
  const market2 = pair?.market2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Arbitrage Opportunity
          </DialogTitle>
          <DialogDescription>
            {pair?.description || `${opportunity.exchange1} ↔ ${opportunity.exchange2}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Profit Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Profit Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Net Profit</p>
                  <p className="text-2xl font-bold text-green-600">
                    {opportunity.profitPercent.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">$ for $10</p>
                  <p className="text-2xl font-bold">
                    ${(10 * (1 + opportunity.profitPercent / 100)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="text-xl font-semibold">${opportunity.totalCost.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max Size</p>
                  <p className="text-xl font-semibold">${opportunity.maxSize.toFixed(0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade Setup */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Trade Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Exchange 1 */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge>{opportunity.exchange1 || pair?.exchange1}</Badge>
                    <Badge variant="outline">{actions.exchange1Action}</Badge>
                  </div>
                  <p className="text-sm font-medium line-clamp-2">
                    {market1?.title || opportunity.market1Title || opportunity.market1Id}
                  </p>
                  {market1?.closeTime && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Closes: {format(new Date(market1.closeTime), 'MMM d, yyyy')}
                    </p>
                  )}
                  {opportunity.quotePair?.quote1 && (
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">Bid: </span>
                      <span className="font-mono">{(opportunity.quotePair.quote1.yes.bid * 100).toFixed(1)}¢</span>
                      <span className="text-muted-foreground ml-2">Ask: </span>
                      <span className="font-mono">{(opportunity.quotePair.quote1.yes.ask * 100).toFixed(1)}¢</span>
                    </div>
                  )}
                </div>

                {/* Exchange 2 */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge>{opportunity.exchange2 || pair?.exchange2}</Badge>
                    <Badge variant="outline">{actions.exchange2Action}</Badge>
                  </div>
                  <p className="text-sm font-medium line-clamp-2">
                    {market2?.title || opportunity.market2Id}
                  </p>
                  {market2?.closeTime && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Closes: {format(new Date(market2.closeTime), 'MMM d, yyyy')}
                    </p>
                  )}
                  {opportunity.quotePair?.quote2 && (
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">Bid: </span>
                      <span className="font-mono">{(opportunity.quotePair.quote2.yes.bid * 100).toFixed(1)}¢</span>
                      <span className="text-muted-foreground ml-2">Ask: </span>
                      <span className="font-mono">{(opportunity.quotePair.quote2.yes.ask * 100).toFixed(1)}¢</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resolution Risk */}
          {resolution && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Resolution Risk
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Score:</span>
                    <span className="text-xl font-bold">{resolution.score}/100</span>
                  </div>
                  <Badge variant={getRiskBadgeVariant(resolution.level)}>
                    {resolution.level}
                  </Badge>
                  {resolution.tradeable ? (
                    <Badge variant="success" className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Tradeable
                    </Badge>
                  ) : (
                    <Badge variant="danger" className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Not Tradeable
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Sources Match</p>
                    <p className={resolution.sourcesMatch ? "text-green-600" : "text-red-600"}>
                      {resolution.sourcesMatch ? "Yes" : "No"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Timing Match</p>
                    <p className="font-semibold">{(resolution.timingMatch * 100).toFixed(0)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Conditions Match</p>
                    <p className={resolution.conditionsMatch ? "text-green-600" : "text-red-600"}>
                      {resolution.conditionsMatch ? "Yes" : "No"}
                    </p>
                  </div>
                </div>

                {resolution.risks.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium mb-1 flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-red-600" /> Risks
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      {resolution.risks.map((risk, i) => (
                        <li key={i}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {resolution.warnings.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-yellow-600" /> Warnings
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside">
                      {resolution.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Fee Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Fee Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {'exchange1Name' in opportunity.fees ? opportunity.fees.exchange1Name : 'Kalshi'} Fee
                  </p>
                  <p className="font-semibold">
                    {'exchange1Fee' in opportunity.fees
                      ? `$${opportunity.fees.exchange1Fee.toFixed(4)}`
                      : `$${(opportunity.fees as any).kalshiFee?.toFixed(4) || '0.00'}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {'exchange2Name' in opportunity.fees ? opportunity.fees.exchange2Name : 'Polymarket'} Fee
                  </p>
                  <p className="font-semibold">
                    {'exchange2Fee' in opportunity.fees
                      ? `$${opportunity.fees.exchange2Fee.toFixed(4)}`
                      : `$${(opportunity.fees as any).polymarketFee?.toFixed(4) || '0.00'}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Fees</p>
                  <p className="font-semibold text-red-600">
                    ${opportunity.fees.totalFees.toFixed(4)} ({opportunity.fees.feePercent.toFixed(2)}%)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Execution Notes */}
          {opportunity.executionNotes && opportunity.executionNotes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Execution Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {opportunity.executionNotes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>ID: {opportunity.id}</span>
            <span>Confidence: {(opportunity.confidence * 100).toFixed(0)}%</span>
            <span>TTL: {opportunity.ttl}s</span>
            <span>{format(new Date(opportunity.timestamp), 'MMM d, yyyy HH:mm:ss')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
