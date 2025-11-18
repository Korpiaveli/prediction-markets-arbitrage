import Decimal from 'decimal.js';

// Configure Decimal for financial precision
Decimal.set({
  precision: 10,
  rounding: Decimal.ROUND_DOWN,
  minE: -9,
  maxE: 9
});

export class SafeDecimal {
  private value: Decimal;

  constructor(val: number | string | Decimal) {
    this.value = new Decimal(val);
  }

  static from(val: number | string | Decimal): SafeDecimal {
    return new SafeDecimal(val);
  }

  add(other: number | SafeDecimal): SafeDecimal {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return new SafeDecimal(this.value.add(otherVal));
  }

  sub(other: number | SafeDecimal): SafeDecimal {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return new SafeDecimal(this.value.sub(otherVal));
  }

  mul(other: number | SafeDecimal): SafeDecimal {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return new SafeDecimal(this.value.mul(otherVal));
  }

  div(other: number | SafeDecimal): SafeDecimal {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    if (otherVal.isZero()) {
      throw new Error('Division by zero');
    }
    return new SafeDecimal(this.value.div(otherVal));
  }

  gt(other: number | SafeDecimal): boolean {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return this.value.gt(otherVal);
  }

  gte(other: number | SafeDecimal): boolean {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return this.value.gte(otherVal);
  }

  lt(other: number | SafeDecimal): boolean {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return this.value.lt(otherVal);
  }

  lte(other: number | SafeDecimal): boolean {
    const otherVal = other instanceof SafeDecimal ? other.value : new Decimal(other);
    return this.value.lte(otherVal);
  }

  toNumber(): number {
    return this.value.toNumber();
  }

  toFixed(places: number): string {
    return this.value.toFixed(places);
  }

  toString(): string {
    return this.value.toString();
  }
}