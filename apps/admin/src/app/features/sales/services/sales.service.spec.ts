import { CUSTOMER_SOURCE_OPTIONS, getCustomerSourceLabel } from './sales.service';

describe('sales helpers', () => {
  it('keeps one generic sales flow while presenting readable customer sources', () => {
    expect(getCustomerSourceLabel('walk_in')).toBe('Walk-in');
    expect(getCustomerSourceLabel('returning_customer')).toBe('Returning Customer');
    expect(CUSTOMER_SOURCE_OPTIONS.length).toBeGreaterThan(0);
  });
});
