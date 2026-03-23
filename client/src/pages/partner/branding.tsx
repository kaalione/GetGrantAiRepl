import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Palette, Save, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/seo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BrandPreview } from "@/components/partner/BrandPreview";

interface BrandingData {
  platformName: string;
  tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  accentColor: string;
  primaryTextColor: string;
  fontFamily: string;
  supportEmail?: string;
  supportUrl?: string;
  footerText?: string;
  showPoweredBy: boolean;
}

interface BrandingFormValues {
  platformName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  primaryTextColor: string;
  fontFamily: string;
  supportEmail: string;
  supportUrl: string;
  footerText: string;
  showPoweredBy: boolean;
}

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Montserrat", label: "Montserrat" },
];

function ColorField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  testId: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border"
          data-testid={`color-picker-${testId}`}
        />
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1"
          data-testid={`input-${testId}`}
        />
      </div>
    </div>
  );
}


export default function PartnerBranding() {
  const { toast } = useToast();

  const { data: branding, isLoading } = useQuery<BrandingData>({
    queryKey: ["/api/partner/branding"],
  });

  const form = useForm<BrandingFormValues>({
    defaultValues: {
      platformName: "",
      tagline: "",
      logoUrl: "",
      faviconUrl: "",
      primaryColor: "#4f46e5",
      accentColor: "#8b5cf6",
      primaryTextColor: "#ffffff",
      fontFamily: "Inter",
      supportEmail: "",
      supportUrl: "",
      footerText: "",
      showPoweredBy: true,
    },
  });

  useEffect(() => {
    if (branding) {
      form.reset({
        platformName: branding.platformName || "",
        tagline: branding.tagline || "",
        logoUrl: branding.logoUrl || "",
        faviconUrl: branding.faviconUrl || "",
        primaryColor: branding.primaryColor || "#4f46e5",
        accentColor: branding.accentColor || "#8b5cf6",
        primaryTextColor: branding.primaryTextColor || "#ffffff",
        fontFamily: branding.fontFamily || "Inter",
        supportEmail: branding.supportEmail || "",
        supportUrl: branding.supportUrl || "",
        footerText: branding.footerText || "",
        showPoweredBy: branding.showPoweredBy ?? true,
      });
    }
  }, [branding, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: BrandingFormValues) => {
      await apiRequest("PUT", "/api/partner/branding", values);
    },
    onSuccess: () => {
      toast({ title: "Varumärke sparat", description: "Dina varumärkesinställningar har uppdaterats." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/branding"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const watchedValues = form.watch();

  function onSubmit(values: BrandingFormValues) {
    saveMutation.mutate(values);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO title="Varumärke - Partner" description="Anpassa din white-label portal" noindex={true} />
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-branding-title">Varumärke</h1>
          <p className="text-muted-foreground" data-testid="text-branding-subtitle">
            Anpassa utseendet på din white-label portal.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Grundinställningar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="platformName">Plattformsnamn *</Label>
                    <Input
                      id="platformName"
                      {...form.register("platformName")}
                      placeholder="Min Plattform"
                      data-testid="input-platform-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tagline">Tagline</Label>
                    <Input
                      id="tagline"
                      {...form.register("tagline")}
                      placeholder="Hitta rätt bidrag"
                      data-testid="input-tagline"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logotyp URL</Label>
                    <Input
                      id="logoUrl"
                      {...form.register("logoUrl")}
                      placeholder="https://example.com/logo.png"
                      data-testid="input-logo-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="faviconUrl">Favicon URL</Label>
                    <Input
                      id="faviconUrl"
                      {...form.register("faviconUrl")}
                      placeholder="https://example.com/favicon.ico"
                      data-testid="input-favicon-url"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Färger & Typsnitt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ColorField
                    label="Primärfärg"
                    value={watchedValues.primaryColor}
                    onChange={(val) => form.setValue("primaryColor", val)}
                    testId="primary-color"
                  />
                  <ColorField
                    label="Accentfärg"
                    value={watchedValues.accentColor}
                    onChange={(val) => form.setValue("accentColor", val)}
                    testId="accent-color"
                  />
                  <ColorField
                    label="Primär textfärg"
                    value={watchedValues.primaryTextColor}
                    onChange={(val) => form.setValue("primaryTextColor", val)}
                    testId="primary-text-color"
                  />
                  <div className="space-y-2">
                    <Label>Typsnittsfamilj</Label>
                    <Select
                      value={watchedValues.fontFamily}
                      onValueChange={(val) => form.setValue("fontFamily", val)}
                    >
                      <SelectTrigger data-testid="select-font-family">
                        <SelectValue placeholder="Välj typsnitt" />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((font) => (
                          <SelectItem key={font.value} value={font.value}>
                            {font.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Support & Övrigt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support e-post</Label>
                    <Input
                      id="supportEmail"
                      {...form.register("supportEmail")}
                      placeholder="support@example.com"
                      data-testid="input-support-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportUrl">Support URL</Label>
                    <Input
                      id="supportUrl"
                      {...form.register("supportUrl")}
                      placeholder="https://support.example.com"
                      data-testid="input-support-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="footerText">Footertext</Label>
                    <Input
                      id="footerText"
                      {...form.register("footerText")}
                      placeholder="© 2026 Mitt Företag"
                      data-testid="input-footer-text"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="showPoweredBy">Visa &quot;Powered by GetGrant.ai&quot;</Label>
                      <p className="text-xs text-muted-foreground">
                        Visar en liten branding-text i sidfoten.
                      </p>
                    </div>
                    <Switch
                      id="showPoweredBy"
                      checked={watchedValues.showPoweredBy}
                      onCheckedChange={(checked) => form.setValue("showPoweredBy", checked)}
                      data-testid="switch-powered-by"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  data-testid="button-save-branding"
                >
                  {saveMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Sparar...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Spara varumärke
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <BrandPreview
                platformName={watchedValues.platformName}
                tagline={watchedValues.tagline}
                logoUrl={watchedValues.logoUrl}
                primaryColor={watchedValues.primaryColor}
                accentColor={watchedValues.accentColor}
                primaryTextColor={watchedValues.primaryTextColor}
                fontFamily={watchedValues.fontFamily}
                supportEmail={watchedValues.supportEmail}
                footerText={watchedValues.footerText}
                showPoweredBy={watchedValues.showPoweredBy}
              />
            </div>
          </div>
        </form>
      </div>
    </>
  );
}