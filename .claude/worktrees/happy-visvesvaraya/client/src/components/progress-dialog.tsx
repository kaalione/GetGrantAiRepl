import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface ProgressDialogProps {
  open: boolean;
  title: string;
  description: string;
  progress: number;
  status?: "loading" | "success" | "error";
}

export function ProgressDialog({ open, title, description, progress, status = "loading" }: ProgressDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-progress">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-progress-title">
            {status === "loading" && <Loader2 className="h-5 w-5 animate-spin text-primary" data-testid="icon-progress-loading" />}
            {status === "success" && <CheckCircle className="h-5 w-5 text-primary" data-testid="icon-progress-success" />}
            {status === "error" && <XCircle className="h-5 w-5 text-destructive" data-testid="icon-progress-error" />}
            {title}
          </DialogTitle>
          <DialogDescription data-testid="text-progress-description">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Progress value={progress} className="h-2" data-testid="progress-bar" />
          <p className="text-sm text-center text-muted-foreground" data-testid="text-progress-percent">
            {t('progress.percentComplete', { percent: progress })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
