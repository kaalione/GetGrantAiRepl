import { createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface WhitelabelBranding {
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  primaryTextColor: string;
  fontFamily: string;
  tagline: string | null;
  supportEmail: string;
  supportUrl: string | null;
  showPoweredBy: boolean;
  footerText: string | null;
  partnerId?: string;
}

interface WhitelabelConfig {
  isWhitelabel: boolean;
  branding: WhitelabelBranding;
  features: {
    allowSelfSignup: boolean;
  };
}

interface WhitelabelContextType {
  config: WhitelabelConfig | null;
  isLoading: boolean;
  isWhitelabel: boolean;
  branding: WhitelabelBranding;
  platformName: string;
}

const DEFAULT_BRANDING: WhitelabelBranding = {
  platformName: "GetGrant.ai",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#2563EB",
  accentColor: "#10B981",
  primaryTextColor: "#FFFFFF",
  fontFamily: "Inter",
  tagline: null,
  supportEmail: "support@getgrant.ai",
  supportUrl: null,
  showPoweredBy: false,
  footerText: null,
};

const WhitelabelContext = createContext<WhitelabelContextType>({
  config: null,
  isLoading: true,
  isWhitelabel: false,
  branding: DEFAULT_BRANDING,
  platformName: "GetGrant.ai",
});

function hexToHSL(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function WhitelabelProvider({ children }: { children: React.ReactNode }) {
  const { data: config, isLoading } = useQuery<WhitelabelConfig>({
    queryKey: ["/api/whitelabel/config"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const branding = config?.branding ?? DEFAULT_BRANDING;
  const isWhitelabel = config?.isWhitelabel ?? false;

  useEffect(() => {
    if (!config?.isWhitelabel || !config.branding) return;

    const { primaryColor, accentColor, primaryTextColor, fontFamily, faviconUrl, platformName } = config.branding;
    const root = document.documentElement;

    if (primaryColor) {
      root.style.setProperty("--color-primary", hexToHSL(primaryColor));
      root.style.setProperty("--color-primary-raw", primaryColor);
    }
    if (accentColor) {
      root.style.setProperty("--color-accent", hexToHSL(accentColor));
    }
    if (primaryTextColor) {
      root.style.setProperty("--color-primary-text", primaryTextColor);
    }
    if (fontFamily && fontFamily !== "Inter") {
      root.style.setProperty("--color-font-family", fontFamily);
      root.style.fontFamily = fontFamily;
    }

    if (platformName) {
      document.title = platformName;
    }
    if (faviconUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    }

    return () => {
      root.style.removeProperty("--color-primary");
      root.style.removeProperty("--color-primary-raw");
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--color-primary-text");
      root.style.removeProperty("--color-font-family");
      root.style.fontFamily = "";
    };
  }, [config]);

  return (
    <WhitelabelContext.Provider
      value={{
        config: config ?? null,
        isLoading,
        isWhitelabel,
        branding,
        platformName: branding.platformName,
      }}
    >
      {children}
    </WhitelabelContext.Provider>
  );
}

export function useWhitelabel() {
  return useContext(WhitelabelContext);
}
