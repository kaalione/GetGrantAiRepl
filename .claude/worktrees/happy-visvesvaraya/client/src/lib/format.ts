import type { MarketCode } from "@/components/market-selector";

export function formatAmount(amount: number, market: MarketCode = "se"): string {
  if (market === "fi") {
    return new Intl.NumberFormat("fi-FI", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (market === "no") {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getCurrencyCode(market: MarketCode = "se"): string {
  if (market === "fi") return "EUR";
  if (market === "no") return "NOK";
  return "SEK";
}

export function getCurrencySymbol(market: MarketCode = "se"): string {
  if (market === "fi") return "€";
  return "kr";
}