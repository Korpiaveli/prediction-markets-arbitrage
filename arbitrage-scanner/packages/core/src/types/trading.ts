export interface OrderRequest {
  marketId: string;
  side: 'YES' | 'NO';
  size: number;
  price: number;
  type: 'limit' | 'market';
}

export interface OrderResult {
  orderId: string;
  status: 'pending' | 'filled' | 'partial' | 'rejected' | 'cancelled';
  filledSize: number;
  filledPrice: number;
  timestamp: Date;
}

export interface OrderStatus {
  orderId: string;
  status: 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';
  filledSize: number;
  remainingSize: number;
  averagePrice: number;
  lastUpdate: Date;
}

export interface Balance {
  available: number;
  allocated: number;
  total: number;
  currency: string;
}
