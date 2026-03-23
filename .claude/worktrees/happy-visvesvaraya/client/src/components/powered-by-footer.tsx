import { useWhitelabel } from "./whitelabel-provider";
import { ExternalLink, Mail } from "lucide-react";

export function WhitelabelFooter() {
  const { isWhitelabel, branding } = useWhitelabel();

  if (!isWhitelabel) return null;

  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="border-t bg-muted/30 py-4 px-6"
      data-testid="whitelabel-footer"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-4" data-testid="footer-left">
          <span data-testid="text-copyright">
            © {currentYear} {branding.platformName}
          </span>
          {branding.footerText && (
            <span data-testid="text-footer-custom">{branding.footerText}</span>
          )}
        </div>

        <div className="flex items-center gap-4" data-testid="footer-right">
          {branding.supportUrl && (
            <a
              href={branding.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              data-testid="link-support-url"
            >
              <ExternalLink className="h-3 w-3" />
              Support
            </a>
          )}
          {branding.supportEmail && (
            <a
              href={`mailto:${branding.supportEmail}`}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              data-testid="link-support-email"
            >
              <Mail className="h-3 w-3" />
              {branding.supportEmail}
            </a>
          )}
          {branding.showPoweredBy && (
            <span data-testid="text-powered-by">
              Powered by{" "}
              <a
                href="https://getgrant.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GetGrant.ai
              </a>
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

export function PoweredByFooter() {
  return <WhitelabelFooter />;
}
