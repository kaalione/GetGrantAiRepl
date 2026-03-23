import { BookOpen, PenLine, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

interface EmptyLibraryProps {
  onCreateBlock: () => void;
}

export function EmptyLibrary({ onCreateBlock }: EmptyLibraryProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" data-testid="empty-library">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <BookOpen className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-library-title">
        {t("contentLibrary.emptyTitle", "Ditt återanvändbara innehållsbibliotek")}
      </h3>
      <p className="text-sm text-muted-foreground max-w-md text-center mb-6" data-testid="text-empty-library-description">
        {t("contentLibrary.emptyBody", "Spara textblock som du kan återanvända i framtida ansökningar. AI föreslår automatiskt relevant innehåll när du skriver.")}
      </p>
      <div className="flex gap-3 mb-10">
        <Button onClick={onCreateBlock} data-testid="button-add-first-block">
          <PenLine className="mr-2 h-4 w-4" />
          {t("contentLibrary.addFirstBlock", "Lägg till ditt första block")}
        </Button>
        <Button variant="outline" onClick={() => navigate("/ansokan")} data-testid="button-extract-from-app">
          {t("contentLibrary.extractFromApp", "Extrahera från en ansökan")}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
        <Card>
          <CardContent className="p-4 text-center">
            <PenLine className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">{t("contentLibrary.howStep1", "Spara en gång")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("contentLibrary.howStep1Desc", "Skriv eller extrahera textblock")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">{t("contentLibrary.howStep2", "AI föreslår")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("contentLibrary.howStep2Desc", "Relevant innehåll visas automatiskt")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">{t("contentLibrary.howStep3", "Använd på sekunder")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("contentLibrary.howStep3Desc", "Infoga i nya ansökningar direkt")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
