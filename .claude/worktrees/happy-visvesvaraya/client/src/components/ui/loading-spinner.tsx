import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-10 h-10",
};

export function LoadingSpinner({ size = "md", className, text }: LoadingSpinnerProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Loader2 className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
      {text && <span className="text-muted-foreground text-sm">{text}</span>}
    </div>
  );
}

export function FullPageLoader({ text = "Laddar..." }: { text?: string }) {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

export function AIGeneratingLoader() {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-primary/20 animate-pulse" />
        <Loader2 className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-primary" />
      </div>
      <div className="text-center space-y-2">
        <p className="font-medium">AI genererar innehåll...</p>
        <p className="text-sm text-muted-foreground">
          Detta kan ta upp till 30 sekunder
        </p>
      </div>
    </div>
  );
}

export function ScraperProgressLoader({ current, total }: { current: number; total: number }) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Skrapar bidrag...</span>
        <span className="font-medium">{current} / {total}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
