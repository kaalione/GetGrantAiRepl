import { useState } from "react";
import { Globe, User, ChevronDown, BarChart3, FileText, Search, Settings, Star } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BrandPreviewProps {
  platformName: string;
  tagline?: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  primaryTextColor: string;
  fontFamily: string;
  supportEmail?: string;
  footerText?: string;
  showPoweredBy: boolean;
  subdomain?: string;
}

function PreviewContent({ values, scale = 1 }: { values: BrandPreviewProps; scale?: number }) {
  const primary = values.primaryColor || "#4f46e5";
  const accent = values.accentColor || "#8b5cf6";
  const textOnPrimary = values.primaryTextColor || "#ffffff";
  const font = values.fontFamily || "Inter";
  const name = values.platformName || "Min Plattform";
  const sub = values.subdomain || name.toLowerCase().replace(/\s+/g, "-");

  return (
    <div
      style={{ fontFamily: font, transform: `scale(${scale})`, transformOrigin: "top left", width: `${100 / scale}%`, height: `${100 / scale}%` }}
      data-testid="preview-content"
    >
      <div className="rounded-lg border shadow-lg overflow-visible bg-background">
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 rounded-t-lg border-b">
          <div className="flex items-center gap-1.5">
            <span className="block h-3 w-3 rounded-full bg-red-400" />
            <span className="block h-3 w-3 rounded-full bg-yellow-400" />
            <span className="block h-3 w-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-2">
            <div className="bg-background rounded-md px-3 py-1 text-xs text-muted-foreground border flex items-center gap-1.5" data-testid="text-preview-url">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{sub}.getgrant.ai</span>
            </div>
          </div>
        </div>

        <div className="flex" style={{ minHeight: scale === 1 ? 420 : 300 }}>
          <div className="w-48 shrink-0 border-r flex flex-col" style={{ backgroundColor: primary }}>
            <div className="p-3 flex items-center gap-2 border-b border-white/10">
              {values.logoUrl ? (
                <img src={values.logoUrl} alt="Logo" className="h-7 w-7 rounded object-contain bg-white/20" data-testid="img-preview-logo" />
              ) : (
                <div className="h-7 w-7 rounded flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "rgba(255,255,255,0.2)", color: textOnPrimary }}>
                  {name.charAt(0)}
                </div>
              )}
              <span className="font-semibold text-sm truncate" style={{ color: textOnPrimary }} data-testid="text-preview-name">
                {name}
              </span>
            </div>

            <nav className="flex-1 p-2 space-y-0.5">
              {[
                { icon: BarChart3, label: "Dashboard", active: true },
                { icon: Search, label: "Grants" },
                { icon: FileText, label: "Applications" },
                { icon: Settings, label: "Settings" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                  style={{
                    color: textOnPrimary,
                    backgroundColor: item.active ? "rgba(255,255,255,0.15)" : "transparent",
                    opacity: item.active ? 1 : 0.7,
                  }}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                </div>
              ))}
            </nav>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                <span>SV</span>
                <ChevronDown className="h-3 w-3" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ backgroundColor: accent }}>
                  <User className="h-3.5 w-3.5" style={{ color: textOnPrimary }} />
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3 bg-muted/30">
              <div className="rounded-lg p-4 border" style={{ backgroundColor: primary }}>
                <h3 className="font-semibold text-sm" style={{ color: textOnPrimary }} data-testid="text-preview-tagline">
                  {values.tagline || `Welcome to ${name}`}
                </h3>
                <p className="text-xs mt-1 opacity-75" style={{ color: textOnPrimary }}>
                  Find the best grants for your business
                </p>
              </div>

              {[
                { title: "Innovation Grant 2026", score: 92 },
                { title: "Digital Transformation Fund", score: 78 },
              ].map((grant) => (
                <div key={grant.title} className="rounded-lg border bg-background p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{grant.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Deadline: 2026-03-15</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Star className="h-3 w-3" style={{ color: accent }} />
                    <span className="text-xs font-bold" style={{ color: primary }}>{grant.score}%</span>
                  </div>
                </div>
              ))}
            </div>

            {(values.footerText || values.showPoweredBy || values.supportEmail) && (
              <div className="px-4 py-2 border-t text-[10px] text-muted-foreground flex items-center justify-between gap-2 flex-wrap">
                <span data-testid="text-preview-footer">
                  {values.footerText}
                  {values.supportEmail && (
                    <span className="ml-2">{values.supportEmail}</span>
                  )}
                </span>
                {values.showPoweredBy && (
                  <span data-testid="text-preview-powered-by">Powered by GetGrant.ai</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandPreview(props: BrandPreviewProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="sticky top-6">
        <div className="overflow-visible" style={{ height: 340 }}>
          <PreviewContent values={props} scale={0.55} />
        </div>

        <Dialog open={fullscreen} onOpenChange={setFullscreen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full mt-3" data-testid="button-preview-fullscreen">
              Preview as client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl w-[90vw] p-6" data-testid="dialog-brand-preview">
            <PreviewContent values={props} scale={1} />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
