import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { SEO } from "@/components/seo";

export default function NotFound() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <>
      <SEO 
        title={t('notFound.seoTitle')} 
        description={t('notFound.seoDesc')}
        noindex={true}
      />
      <div className="min-h-[60vh] w-full flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <FileQuestion className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">{t('notFound.title')}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              {t('notFound.description')}
            </p>
          </CardContent>
          <CardFooter className="flex gap-2 justify-center">
            <Button 
              variant="outline" 
              onClick={() => window.history.back()}
              data-testid="button-go-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('notFound.goBack')}
            </Button>
            <Link href="/">
              <Button data-testid="button-home-404">
                <Home className="w-4 h-4 mr-2" />
                {t('notFound.goHome')}
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
