import { StatsCardsSkeleton } from './ui/skeleton';

interface StatsCardsProps {
  stats: {
    total: number;
    avgProfit: number;
    maxProfit: number;
    avgConfidence: number;
    validCount: number;
  } | null;
  loading?: boolean;
}

export function StatsCards({ stats, loading = false }: StatsCardsProps) {
  if (loading || !stats) {
    return <StatsCardsSkeleton />;
  }

  const validRate = stats.total > 0
    ? ((stats.validCount / stats.total) * 100).toFixed(0)
    : '0';

  const cards = [
    {
      label: 'Total Opportunities',
      value: stats.total.toLocaleString(),
    },
    {
      label: 'Avg Profit',
      value: `${stats.avgProfit.toFixed(2)}%`,
    },
    {
      label: 'Max Profit',
      value: `${stats.maxProfit.toFixed(2)}%`,
    },
    {
      label: 'Avg Confidence',
      value: `${(stats.avgConfidence || 0).toFixed(0)}%`,
    },
    {
      label: 'Valid Rate',
      value: `${validRate}%`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-md transition"
        >
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
