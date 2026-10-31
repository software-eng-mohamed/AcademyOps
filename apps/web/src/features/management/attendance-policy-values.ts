export type AttendancePolicyValues = Record<
  | 'minimumPercent'
  | 'lockAfterMinutes'
  | 'checkInOpensBeforeMinutes'
  | 'checkInClosesAfterMinutes'
  | 'effectiveFrom'
  | 'effectiveTo',
  string
>;
export function validAttendancePolicy(value: AttendancePolicyValues) {
  const integer = (raw: string, min: number, max: number) =>
    /^\d+$/.test(raw) &&
    Number.isSafeInteger(Number(raw)) &&
    Number(raw) >= min &&
    Number(raw) <= max;
  const minimum = Number(value.minimumPercent);
  return (
    /^\d+(\.\d{1,2})?$/.test(value.minimumPercent) &&
    minimum >= 80 &&
    minimum <= 100 &&
    integer(value.lockAfterMinutes, 1, 10080) &&
    integer(value.checkInOpensBeforeMinutes, 0, 1440) &&
    integer(value.checkInClosesAfterMinutes, 0, 1440) &&
    Number.isFinite(Date.parse(value.effectiveFrom)) &&
    (!value.effectiveTo ||
      (Number.isFinite(Date.parse(value.effectiveTo)) &&
        Date.parse(value.effectiveTo) > Date.parse(value.effectiveFrom)))
  );
}
