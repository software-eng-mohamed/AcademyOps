export type InvoiceLine = {
  key: string;
  ledgerEntryId: string;
  descriptionAr: string;
  descriptionEn: string;
  quantity: string;
  unitAmount: string;
  taxAmount: string;
};
export function newInvoiceLine(): InvoiceLine {
  return {
    key: crypto.randomUUID(),
    ledgerEntryId: '',
    descriptionAr: '',
    descriptionEn: '',
    quantity: '1',
    unitAmount: '',
    taxAmount: '',
  };
}
export function invoiceLines(value: string | undefined): InvoiceLine[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function validInvoiceLines(value: string): boolean {
  const lines = invoiceLines(value);
  const positive = (amount: unknown) =>
    typeof amount === 'string' && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  return (
    lines.length > 0 &&
    lines.length <= 100 &&
    new Set(lines.map((line) => line?.ledgerEntryId)).size === lines.length &&
    lines.every(
      (line) =>
        line &&
        typeof line.ledgerEntryId === 'string' &&
        line.ledgerEntryId.trim() &&
        ((typeof line.descriptionEn === 'string' && line.descriptionEn.trim()) ||
          (typeof line.descriptionAr === 'string' && line.descriptionAr.trim())) &&
        positive(line.quantity) &&
        positive(line.unitAmount) &&
        (!line.taxAmount ||
          (/^\d+(\.\d{1,2})?$/.test(line.taxAmount) && Number(line.taxAmount) >= 0)),
    )
  );
}
