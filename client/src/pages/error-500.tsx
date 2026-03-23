import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerCrash, RefreshCw, Home } from "lucide-react";
import { Link } from "wouter";
import { SEO } from '@/components/seo';

export default function Error500() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <SEO title="Serverfel" noindex={true} />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ServerCrash className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">500 - Serverfel</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground">
            Ett internt serverfel inträffade. Vi arbetar på att lösa problemet.
            Försök igen om en stund.
          </p>
        </CardContent>
        <CardFooter className="flex gap-2 justify-center">
          <Button variant="outline" onClick={handleRetry} data-testid="button-retry-500">
            <RefreshCw className="w-4 h-4 mr-2" />
            Försök igen
          </Button>
          <Link href="/">
            <Button data-testid="button-home-500">
              <Home className="w-4 h-4 mr-2" />
              Till startsidan
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
