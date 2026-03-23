import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceForm, type SourceFormData } from "@/components/admin/source-form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { SEO } from '@/components/seo';

export default function NewSourcePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: SourceFormData) => {
      return apiRequest("POST", "/api/scraper-sources", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-sources"] });
      toast({
        title: "Källa skapad",
        description: "Den nya datakällan har lagts till.",
      });
      setLocation("/admin/sources");
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte skapa källan. Försök igen.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <SEO title="Admin - Ny källa" noindex={true} />
      <div className="flex items-center gap-4">
        <Link href="/admin/sources">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Lägg till ny källa
          </h1>
          <p className="text-muted-foreground mt-1">
            Konfigurera en ny datakälla för bidragsinformation
          </p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Källkonfiguration
          </CardTitle>
          <CardDescription>
            Fyll i information om API:et eller webbsidan du vill hämta data från
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourceForm
            onSubmit={(data) => createMutation.mutate(data)}
            isPending={createMutation.isPending}
            submitLabel="Skapa källa"
          />
        </CardContent>
      </Card>
    </div>
  );
}
