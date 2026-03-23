import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export const MARKETS = [
  { code: "se", label: "Sverige", flag: "🇸🇪", lang: "sv" },
  { code: "no", label: "Norge", flag: "🇳🇴", lang: "no" },
  { code: "fi", label: "Suomi", flag: "🇫🇮", lang: "fi" },
] as const;

export type MarketCode = (typeof MARKETS)[number]["code"];

export function getMarket(): MarketCode {
  const stored = localStorage.getItem("selectedMarket");
  if (stored && MARKETS.some((m) => m.code === stored)) {
    return stored as MarketCode;
  }
  return "se";
}

export function setMarket(code: MarketCode) {
  localStorage.setItem("selectedMarket", code);
  window.dispatchEvent(new CustomEvent("marketChanged", { detail: code }));
}

export function useMarket() {
  const [market, setMarketState] = useState<MarketCode>(getMarket);

  useEffect(() => {
    const handler = (e: Event) => {
      const code = (e as CustomEvent).detail as MarketCode;
      setMarketState(code);
    };
    window.addEventListener("marketChanged", handler);
    return () => window.removeEventListener("marketChanged", handler);
  }, []);

  return market;
}

export function MarketSelector() {
  const { i18n } = useTranslation();
  const market = useMarket();
  const currentMarket = MARKETS.find((m) => m.code === market) || MARKETS[0];

  const handleSelect = async (m: (typeof MARKETS)[number]) => {
    setMarket(m.code);
    i18n.changeLanguage(m.lang);
    try {
      await apiRequest("PUT", "/api/companies/market", { market: m.code });
    } catch {
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-sm"
          data-testid="market-selector"
        >
          <span className="text-base">{currentMarket.flag}</span>
          <span className="hidden sm:inline">{currentMarket.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MARKETS.map((m) => (
          <DropdownMenuItem
            key={m.code}
            onClick={() => handleSelect(m)}
            className={market === m.code ? "bg-accent" : ""}
            data-testid={`market-option-${m.code}`}
          >
            <span className="text-base mr-2">{m.flag}</span>
            <span>{m.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}