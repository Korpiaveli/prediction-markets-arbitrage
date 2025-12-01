interface ScannerStatusProps {
  connected: boolean;
}

export function ScannerStatus({ connected }: ScannerStatusProps) {
  return (
    <div className="flex items-center space-x-2">
      <div
        className={`w-3 h-3 rounded-full ${
          connected ? 'bg-green-500' : 'bg-red-500'
        } animate-pulse`}
      />
      <span className="text-sm text-gray-600">
        {connected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}
