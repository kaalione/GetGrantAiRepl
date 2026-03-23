import { useTranslation } from 'react-i18next';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Building2, Sparkles, FileText, Brain, Send, Trophy, ArrowRight, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";

interface Milestone {
  key: string;
  completed: boolean;
  completedAt: string | null;
}

interface ProgressResponse {
  milestones: Milestone[];
  completedCount: number;
  totalSteps: number;
  profileCreated: boolean;
  profileCompleted: boolean;
  firstGrantViewed: boolean;
  firstAIAnalysisRun: boolean;
  firstApplicationGenerated: boolean;
  firstApplicationSubmitted: boolean;
  companyCreated: boolean;
  firstMatchViewed: boolean;
}

interface ProgressTrackerProps {
  compact?: boolean;
}

export function ProgressTracker({ compact = false }: ProgressTrackerProps) {
  const { t } = useTranslation();
  const { data: progress, isLoading } = useQuery<ProgressResponse>({
    queryKey: ["/api/user/onboarding-progress"],
  });

  if (isLoading) {
    return (
      <Card data-testid="progress-tracker">
        <CardContent className="p-6">
          <div className="space-y-3 animate-pulse">
            <div className="h-6 bg-muted rounded w-3/4" />
            <div className="h-6 bg-muted rounded w-3/4" />
            <div className="h-6 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!progress) return null;

  const steps = [
    {
      id: "profileCreated",
      label: t('progress.createProfile'),
      description: t('progress.createProfileDesc'),
      completed: !!progress.profileCreated,
      icon: Building2,
      href: "/company",
      actionLabel: t('progress.createProfileAction'),
    },
    {
      id: "profileCompleted",
      label: t('progress.completeProfile'),
      description: t('progress.completeProfileDesc'),
      completed: !!progress.profileCompleted,
      icon: UserCheck,
      href: "/company",
      actionLabel: t('progress.completeProfileAction'),
      dependsOn: "profileCreated",
    },
    {
      id: "firstGrantViewed",
      label: t('progress.viewGrants'),
      description: t('progress.viewGrantsDesc'),
      completed: !!progress.firstGrantViewed,
      icon: Sparkles,
      href: "/bidrag",
      actionLabel: t('progress.viewGrantsAction'),
      dependsOn: "profileCompleted",
    },
    {
      id: "firstAIAnalysisRun",
      label: t('progress.runAIAnalysis'),
      description: t('progress.runAIAnalysisDesc'),
      completed: !!progress.firstAIAnalysisRun,
      icon: Brain,
      href: "/bidrag",
      actionLabel: t('progress.runAIAnalysisAction'),
      dependsOn: "firstGrantViewed",
    },
    {
      id: "firstApplicationGenerated",
      label: t('progress.generateApplication'),
      description: t('progress.generateApplicationDesc'),
      completed: !!progress.firstApplicationGenerated,
      icon: FileText,
      href: "/bidrag",
      actionLabel: t('progress.generateApplicationAction'),
      dependsOn: "firstAIAnalysisRun",
    },
    {
      id: "firstApplicationSubmitted",
      label: t('progress.submitApplication'),
      description: t('progress.submitApplicationDesc'),
      completed: !!progress.firstApplicationSubmitted,
      icon: Send,
      href: "/ansokan",
      actionLabel: t('progress.submitApplicationAction'),
      dependsOn: "firstApplicationGenerated",
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const totalSteps = steps.length;
  const allCompleted = completedCount === totalSteps;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const isDependencyMet = (step: typeof steps[0]) => {
    if (!step.dependsOn) return true;
    const dep = steps.find(s => s.id === step.dependsOn);
    return dep?.completed ?? false;
  };

  const nextStep = steps.find(s => !s.completed && isDependencyMet(s));

  if (allCompleted) return null;

  if (compact) {
    return (
      <Card className="border-2 border-blue-500 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20" data-testid="progress-tracker-compact">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-semibold text-sm">
                  {completedCount}/{totalSteps} {t('progress.completed')}
                </div>
                {nextStep && (
                  <div className="text-xs text-muted-foreground">
                    {nextStep.label}
                  </div>
                )}
              </div>
            </div>
            {nextStep && (
              <Link href={nextStep.href}>
                <Button size="sm" variant="ghost" data-testid="button-progress-continue">
                  {nextStep.actionLabel}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
          <Progress value={progressPercent} className="h-1.5 mt-3" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-blue-500 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20" data-testid="progress-tracker">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-blue-600" />
            {t('progress.title')}
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {t('progress.completedOf', { completed: completedCount, total: totalSteps })}
          </span>
        </div>
        <Progress value={progressPercent} className="h-2 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {steps.map((step) => {
            const isLocked = !isDependencyMet(step);
            const isCurrent = !step.completed && !isLocked;
            const Icon = step.icon;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-md transition-all ${
                  step.completed
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : isCurrent
                    ? 'bg-white dark:bg-gray-800 border-2 border-blue-500'
                    : 'bg-gray-50 dark:bg-gray-800/50 opacity-60 border border-transparent'
                }`}
                data-testid={`progress-step-${step.id}`}
              >
                {step.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <Circle className={`h-5 w-5 mt-0.5 shrink-0 ${isCurrent ? 'text-blue-500' : 'text-muted-foreground'}`} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`h-4 w-4 ${step.completed ? 'text-green-600' : isCurrent ? 'text-blue-500' : 'text-muted-foreground'}`} />
                    <span className={`font-medium text-sm ${step.completed ? 'text-green-700 dark:text-green-400' : ''}`}>
                      {step.label}
                    </span>
                  </div>
                  {isCurrent && step.description && (
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      {step.description}
                    </p>
                  )}
                  {isCurrent && (
                    <Link href={step.href}>
                      <Button size="sm" variant="default" data-testid={`button-${step.id}-action`}>
                        {step.actionLabel}
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
