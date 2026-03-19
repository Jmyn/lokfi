import { DashboardFilterProvider, useDashboard } from './DashboardContext'
import { DashboardFilters } from './DashboardFilters'
import { KpiRow } from './widgets/KpiRow'
import { SavingsRateGauge } from './widgets/SavingsRateGauge'
import { AverageSpending } from './widgets/AverageSpending'
import { MonthlyTrendChart } from './widgets/MonthlyTrendChart'
import { SpendingHeatmap } from './widgets/SpendingHeatmap'
import { CategoryBreakdown } from './widgets/CategoryBreakdown'
import { CategoryBudgetBars } from './widgets/CategoryBudgetBars'
import { TopMerchants } from './widgets/TopMerchants'

function DashboardContent() {
  const { isLoading, transactions } = useDashboard()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">
        Loading...
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-6 p-6 max-w-6xl">
        <DashboardFilters />
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-gray-500 dark:text-gray-400">
            No transactions match your filters. Try adjusting or clearing them.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <DashboardFilters />
      <KpiRow />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SavingsRateGauge />
        <AverageSpending />
      </div>
      <MonthlyTrendChart />
      <SpendingHeatmap />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CategoryBreakdown />
        <CategoryBudgetBars />
      </div>
      <TopMerchants />
    </div>
  )
}

export function DashboardPage() {
  return (
    <DashboardFilterProvider>
      <DashboardContent />
    </DashboardFilterProvider>
  )
}
