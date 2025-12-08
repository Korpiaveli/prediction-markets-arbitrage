interface StatsCardsProps {
  stats: {
    total: number;
    avgProfit: number;
    maxProfit: number;
    avgConfidence: number;
    validCount: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const validRate = stats.total > 0
    ? ((stats.validCount / stats.total) * 100).toFixed(0)
    : '0';

  const cards = [
    {
      label: 'Total Opportunities',
      value: stats.total.toLocaleString(),
      change: null,
    },
    {
      label: 'Avg Profit',
      value: `${stats.avgProfit.toFixed(2)}%`,
      change: null,
    },
    {
      label: 'Max Profit',
      value: `${stats.maxProfit.toFixed(2)}%`,
      change: null,
    },
    {
      label: 'Avg Confidence',
      value: `${(stats.avgConfidence || 0).toFixed(0)}%`,
      change: null,
    },
    {
      label: 'Valid Rate',
      value: `${validRate}%`,
      change: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white shadow rounded-lg p-6 hover:shadow-md transition"
        >
          <p className="text-sm font-medium text-gray-600">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
