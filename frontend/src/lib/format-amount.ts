/** Local formatter pending the official Lime Amount component. Keeps token rates precise. */
export function formatAmount(amount: number, currency: "USD" | "USDC"): string {
  if (currency === "USDC") {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(amount)} USDC`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(amount);
}
