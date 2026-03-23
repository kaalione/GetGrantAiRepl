import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Database, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SourceForm, type SourceFormData } from "@/components/admin/source-form";
import { FormSkeleton } from "@/components/loading-skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ScraperSource } from "@shared/schema";
import { Link } from "wouter";
import { SEO } from '@/components/seo';

export default function EditSourcePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: source, isLoading } = useQuery<ScraperSource>({
    queryKey: ["/api/scraper-sources", params.id],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SourceFormData) => {
      return apiRequest("PATCH", `/api/scraper-sources/${params.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-sources"] });
      toast({
        title: "Källa uppdaterad",
        description: "Ändringarna har sparats.",
      });
      setLocation("/admin/sources");
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte uppdatera källan. Försök igen.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/scraper-sources/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scraper-sources"] });
      toast({
        title: "Källa borttagen",
        description: "Datakällan har tagits bort.",
      });
      setLocation("/admin/sources");
    },
    onError: () => {
      toast({
        title: "Fel",
        description: "Kunde inte ta bort källan. Försök igen.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/sources">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Redigera källa</h1>
            <p className="text-muted-foreground mt-1">Laddar...</p>
          </div>
        </div>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Laddar...</CardTitle>
          </CardHeader>
          <CardContent>
            <FormSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/sources">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Källa hittades inte</h1>
            <p className="text-muted-foreground mt-1">
              Datakällan finns inte eller har tagits bort
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SEO title="Admin - Redigera källa" noindex={true} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/sources">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
              Redigera {source.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              Uppdatera konfigurationen för denna datakälla
            </p>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" data-testid="button-delete-source">
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Är du säker?</AlertDialogTitle>
              <AlertDialogDescription>
                Detta kommer att permanent ta bort datakällan "{source.name}" och 
                alla tillhörande loggar. Denna åtgärd kan inte ångras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Ta bort
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Källkonfiguration
          </CardTitle>
          <CardDescription>
            Uppdatera inställningarna för denna datakälla
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourceForm
            defaultValues={source}
            onSubmit={(data) => updateMutation.mutate(data)}
            isPending={updateMutation.isPending}
            submitLabel="Spara ändringar"
          />
        </CardContent>
      </Card>
    </div>
  );
}
