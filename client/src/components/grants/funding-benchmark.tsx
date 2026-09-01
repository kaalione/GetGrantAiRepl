import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Benchmark {
  awards: number;
  companies: number;
  median: number | null;
  p10: number | null;
  p90: number | null;
  years: { from: number | null; to: number | null };
}

/**
 * What this funder has actually awarded companies, next to what the call
 * advertises.
 *
 * A call quoting "up to 5 000 000 kr" tells an applicant almost nothing: the
 * median Vinnova award to a company is around 147 000. This is the one number
 * that changes whether the effort is worth it, and no competitor shows it.
 *
 * Both thresholds matter, and the second is the one that bites. Counting awards
 * alone, Vetenskapsrådet passes with 37 — spread across four companies. A
 * median of four companies is noise wearing the clothes of a benchmark, so a
 * funder must have awarded a reasonable number of distinct companies before
 * this claims to describe what a company can expect.
 *
 * In practice that means Vinnova today: the research councils fund universities,
 * and their company awards number in the tens.
 */
const MIN_AWARDS = 30;
const MIN_COMPANIES = 20;

function kr(value: number): string {
  return `${value.toLocaleString("sv-SE")} kr`;
}

export function FundingBenchmark({ sourceName }: { sourceName: string }) {
  const { t } = useTranslation();

  const { data } = useQuery<Benchmark>({
    // Only the last five years: award sizes have grown, and older decisions
    // would drag the figure below what an applicant can expect now.
    queryKey: [`/api/benchmarks/funding?funder=${encodeURIComponent(sourceName)}&sinceYear=${new Date().getFullYear() - 5}`],
    staleTime: 60 * 60 * 1000,
  });

  if (!data || data.median === null) return null;
  if (data.awards < MIN_AWARDS || data.companies < MIN_COMPANIES) return null;

  return (
    <Card data-testid="card-funding-benchmark">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {t("grantDetail.benchmark.label", "Vad som faktiskt beviljas")}
            </p>
            <p className="font-semibold" data-testid="text-benchmark-median">
              {t("grantDetail.benchmark.median", "Median {{amount}}", { amount: kr(data.median) })}
            </p>
          </div>
        </div>

        {data.p10 !== null && data.p90 !== null && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{kr(data.p10)}</span>
              <span>{kr(data.p90)}</span>
            </div>
            {/* Where the median sits between the tenth and ninetieth percentile. */}
            <div className="relative h-1.5 rounded-full bg-muted">
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
                style={{
                  left: `${Math.min(96, Math.max(2, ((data.median - data.p10) / Math.max(1, data.p90 - data.p10)) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("grantDetail.benchmark.spread", "8 av 10 beviljade belopp ligger i detta spann")}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t pt-3">
          {t("grantDetail.benchmark.basis", {
            // beslutadFinansieringAr is the year the funding applies to, not
            // the decision date, and it runs into the future — commitments for
            // 2031 already exist. "since {{from}}" says what is true without
            // implying a decision was made in 2031.
            defaultValue:
              "Baserat på {{awards}} beviljade belopp till {{companies}} företag sedan {{from}}. Öppna data från finansiärerna.",
            awards: data.awards.toLocaleString("sv-SE"),
            companies: data.companies.toLocaleString("sv-SE"),
            from: data.years.from,
          })}
        </p>
      </CardContent>
    </Card>
  );
}
