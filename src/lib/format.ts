export function formatEUR(amount: number | string) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(amount));
}
