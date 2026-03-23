import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Något gick fel</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-4">
                Ett oväntat fel inträffade. Försök igen eller gå tillbaka till startsidan.
              </p>
              {this.state.error && (
                <details className="text-left text-xs bg-muted p-3 rounded-md">
                  <summary className="cursor-pointer text-muted-foreground">
                    Tekniska detaljer
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
            </CardContent>
            <CardFooter className="flex gap-2 justify-center">
              <Button variant="outline" onClick={this.handleRetry} data-testid="button-retry">
                <RefreshCw className="w-4 h-4 mr-2" />
                Försök igen
              </Button>
              <Button onClick={this.handleGoHome} data-testid="button-go-home">
                <Home className="w-4 h-4 mr-2" />
                Till startsidan
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
