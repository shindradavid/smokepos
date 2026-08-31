import {
  DateRangePickerComponent,
  formatLocalDate,
  parseLocalDate,
} from './date-range-picker.component';

describe('DateRangePickerComponent', () => {
  it('emits month-to-date after initialization', () => {
    const component = new DateRangePickerComponent();
    const emitted = jasmine.createSpy('rangeChange');
    component.rangeChange.subscribe(emitted);

    component.ngOnInit();

    const now = new Date();
    expect(emitted).toHaveBeenCalledWith({
      startDate: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: formatLocalDate(now),
    });
  });

  it('serializes and parses local calendar dates without a UTC shift', () => {
    const localDate = new Date(2026, 7, 31);

    expect(formatLocalDate(localDate)).toBe('2026-08-31');
    const parsed = parseLocalDate('2026-08-31');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(31);
  });

  it('emits a manually selected range', () => {
    const component = new DateRangePickerComponent();
    const emitted = jasmine.createSpy('rangeChange');
    component.rangeChange.subscribe(emitted);
    component.ngOnInit();
    emitted.calls.reset();

    component.startDate = new Date(2026, 4, 4);
    component.endDate = new Date(2026, 4, 18);
    component.onDateChange();

    expect(emitted).toHaveBeenCalledWith({ startDate: '2026-05-04', endDate: '2026-05-18' });
  });
});
