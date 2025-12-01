import { formatDistanceToNow } from 'date-fns';

interface OpportunityListProps {
  opportunities: any[];
}

export function OpportunityList({ opportunities }: OpportunityListProps) {
  if (opportunities.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No opportunities found. Try triggering a scan.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Market Pair
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Profit
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Confidence
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Age
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {opportunities.map((opp, index) => (
            <tr key={opp.id || index} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-gray-900">
                  {opp.marketPair?.market1?.title || 'Unknown'}
                </div>
                <div className="text-sm text-gray-500">
                  {opp.marketPair?.market1?.exchange} ↔{' '}
                  {opp.marketPair?.market2?.exchange}
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`text-sm font-semibold ${
                  opp.profitPercent >= 5 ? 'text-green-600' :
                  opp.profitPercent >= 2 ? 'text-green-500' :
                  'text-gray-600'
                }`}>
                  {opp.profitPercent?.toFixed(2)}%
                </span>
              </td>
              <td className="px-6 py-4">
                <span className="text-sm text-gray-900">
                  {(opp.confidence * 100).toFixed(0)}%
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {formatDistanceToNow(new Date(opp.timestamp), { addSuffix: true })}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  opp.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {opp.valid ? 'Valid' : 'Invalid'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
