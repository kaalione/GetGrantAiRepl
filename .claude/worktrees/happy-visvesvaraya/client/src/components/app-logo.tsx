import { useWhitelabel } from "./whitelabel-provider";

interface AppLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizeClasses = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

const textSizeClasses = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

const badgeSizeClasses = {
  sm: "text-[8px] px-1",
  md: "text-[9px] px-1.5",
  lg: "text-[10px] px-1.5",
};

export function AppLogo({ className = "", size = "md", showText = true }: AppLogoProps) {
  const { branding, isWhitelabel } = useWhitelabel();

  if (isWhitelabel && branding.logoUrl) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="app-logo">
        <img
          src={branding.logoUrl}
          alt={branding.platformName}
          className={`${sizeClasses[size]} w-auto object-contain`}
        />
        {showText && (
          <span
            className={`font-semibold ${textSizeClasses[size]}`}
            style={{ color: "var(--color-primary-raw, inherit)" }}
          >
            {branding.platformName}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="app-logo">
      <div
        className={`${sizeClasses[size]} aspect-square rounded-lg flex items-center justify-center text-white font-bold`}
        style={{ backgroundColor: branding.primaryColor }}
      >
        G
      </div>
      {showText && (
        <span className={`font-semibold ${textSizeClasses[size]}`}>
          {isWhitelabel ? branding.platformName : (
            <>
              GetGrant
              <span
                className={`ml-1 inline-flex items-center rounded-md bg-primary/10 text-primary font-semibold ${badgeSizeClasses[size]}`}
              >
                .ai
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}
