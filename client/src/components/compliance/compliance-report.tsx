import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ComplianceReport as ComplianceReportType, SectionCompliance, ComplianceIssue } from "@shared/schema";

function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 50) return "text-orange-500 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function getProgressColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-yellow-500";
  if (score >= 50) return "bg-orange-500";
  return "bg-red-500";
}

function getReadinessLabel(level: string, t: any): string {
  const labels: Record<string, string> = {
    ready: t("compliance.readiness.ready", "Redo att skicka"),
    almost_ready: t("compliance.readiness.almostReady", "Nästan redo"),
    needs_work: t("compliance.readiness.needsWork", "Behöver arbete"),
    not_ready: t("compliance.readiness.notReady", "Inte redo"),
  };
  return labels[level] || level;
}

function getReadinessBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "ready") return "default";
  if (level === "almost_ready") return "secondary";
  if (level === "needs_work") return "outline";
  return "destructive";
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical")
    return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (severity === "major")
    return <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />;
  return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
}

function SeverityBadge({ severity }: { severity: string }) {
  const variants: Record<string, "destructive" | "outline" | "secondary"> = {
    critical: "destructive",
    major: "outline",
    minor: "secondary",
  };
  const labels: Record<string, string> = {
    critical: "Kritisk",
    major: "Viktig",
    minor: "Mindre",
  };
  return (
    <Badge variant={variants[severity] || "secondary"} className="text-xs">
      {labels[severity] || severity}
    </Badge>
  );
}

function IssueItem({
  issue,
  onFix,
}: {
  issue: ComplianceIssue;
  onFix?: () => void;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2" data-testid={`compliance-issue-${issue.severity}`}>
      <div className="flex items-start gap-2">
        <SeverityIcon severity={issue.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={issue.severity} />
            <span className="text-xs text-muted-foreground">{issue.criterion}</span>
          </div>
          <p className="text-sm mt-1">{issue.issue}</p>
          <div className="mt-2 bg-muted/50 rounded p-2">
            <p className="text-xs text-muted-foreground font-medium mb-1">Fix:</p>
            <p className="text-sm">{issue.fix}</p>
          </div>
        </div>
      </div>
      {onFix && (issue.severity === "critical" || issue.severity === "major") && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={onFix}
            data-testid={`button-fix-issue`}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Fixa detta avsnitt
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionScoreCard({
  section,
  onFixSection,
  isExpanded,
  onToggle,
}: {
  section: SectionCompliance;
  onFixSection?: (sectionKey: string, fix: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const criticalCount = section.issues.filter((i) => i.severity === "critical").length;
  const majorCount = section.issues.filter((i) => i.severity === "major").length;

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`compliance-section-${section.sectionKey}`}>
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
        onClick={onToggle}
        data-testid={`button-toggle-section-${section.sectionKey}`}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{section.sectionTitle}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-xs">{criticalCount} kritisk</Badge>
          )}
          {majorCount > 0 && (
            <Badge variant="outline" className="text-xs">{majorCount} viktig</Badge>
          )}
          <div className="w-20">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getProgressColor(section.score)}`}
                style={{ width: `${section.score}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-bold tabular-nums w-10 text-right ${getScoreColor(section.score)}`}>
            {section.score}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t p-3 space-y-3 bg-muted/20">
          {section.issues.length > 0 && (
            <div className="space-y-2">
              {section.issues.map((issue, i) => (
                <IssueItem
                  key={i}
                  issue={issue}
                  onFix={
                    onFixSection
                      ? () => onFixSection(section.sectionKey, issue.fix)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
          {section.suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Förbättringsförslag:</p>
              {section.suggestions.map((suggestion, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <TrendingUp className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          )}
          {section.issues.length === 0 && section.suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">Inga problem hittades i detta avsnitt.</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ComplianceReportProps {
  report: ComplianceReportType;
  onRecheck?: () => void;
  isRechecking?: boolean;
  onFixSection?: (sectionKey: string, fixInstructions: string) => void;
}

export function ComplianceReportPanel({
  report,
  onRecheck,
  isRechecking,
  onFixSection,
}: ComplianceReportProps) {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    report.sections.forEach((s) => {
      if (s.issues.some((i) => i.severity === "critical" || i.severity === "major")) {
        initial.add(s.sectionKey);
      }
    });
    return initial;
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const checkedDate = report.checkedAt
    ? new Date(report.checkedAt).toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Card data-testid="compliance-report-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">
              {t("compliance.title", "Compliance-rapport")}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {checkedDate && (
              <span className="text-xs text-muted-foreground">{checkedDate}</span>
            )}
            {onRecheck && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRecheck}
                disabled={isRechecking}
                data-testid="button-recheck-compliance"
              >
                {isRechecking ? t("compliance.rechecking", "Kontrollerar...") : t("compliance.recheck", "Kontrollera igen")}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-muted"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeWidth="2.5"
                  strokeDasharray={`${report.overallScore}, 100`}
                  strokeLinecap="round"
                  className={getScoreColor(report.overallScore).replace("text-", "stroke-")}
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${getScoreColor(report.overallScore)}`}>
                {report.overallScore}
              </span>
            </div>
            <div>
              <Badge variant={getReadinessBadgeVariant(report.readinessLevel)} data-testid="badge-readiness">
                {getReadinessLabel(report.readinessLevel, t)}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {t("compliance.estimatedSuccess", "Uppskattad framgång")}: {report.estimatedSuccessRate}
              </p>
            </div>
          </div>
        </div>

        {report.criticalIssues.length > 0 && (
          <div className="space-y-2" data-testid="compliance-critical-issues">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {t("compliance.criticalIssues", "Kritiska problem")} ({report.criticalIssues.length})
            </h4>
            <div className="space-y-2">
              {report.criticalIssues.map((issue, i) => (
                <div
                  key={i}
                  className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{issue}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2" data-testid="compliance-section-scores">
          <h4 className="text-sm font-semibold">
            {t("compliance.sectionScores", "Avsnitt")}
          </h4>
          <div className="space-y-2">
            {report.sections.map((section) => (
              <SectionScoreCard
                key={section.sectionKey}
                section={section}
                onFixSection={onFixSection}
                isExpanded={expandedSections.has(section.sectionKey)}
                onToggle={() => toggleSection(section.sectionKey)}
              />
            ))}
          </div>
        </div>

        {report.improvements.length > 0 && (
          <div className="space-y-2" data-testid="compliance-improvements">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <TrendingUp className="h-4 w-4" />
              {t("compliance.improvements", "Förbättringar med hög effekt")} ({report.improvements.length})
            </h4>
            <div className="space-y-1.5">
              {report.improvements.map((improvement, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-orange-500 shrink-0 mt-0.5">→</span>
                  <span>{improvement}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.strengths.length > 0 && (
          <div className="space-y-2" data-testid="compliance-strengths">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {t("compliance.strengths", "Styrkor")} ({report.strengths.length})
            </h4>
            <div className="space-y-1.5">
              {report.strengths.map((strength, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                  <span>{strength}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ComplianceScoreBadge({
  score,
  small = false,
}: {
  score: number | null | undefined;
  small?: boolean;
}) {
  if (score == null) {
    return (
      <Badge variant="outline" className={small ? "text-xs" : ""} data-testid="badge-compliance-none">
        <ShieldCheck className={`${small ? "h-3 w-3" : "h-3.5 w-3.5"} mr-1 text-muted-foreground`} />
        —
      </Badge>
    );
  }

  const variant: "default" | "destructive" | "outline" =
    score >= 85 ? "default" : score >= 50 ? "outline" : "destructive";

  return (
    <Badge variant={variant} className={small ? "text-xs" : ""} data-testid="badge-compliance-score">
      <ShieldCheck className={`${small ? "h-3 w-3" : "h-3.5 w-3.5"} mr-1`} />
      {score}/100
    </Badge>
  );
}
