import { Search, X, Calendar, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from 'react-i18next';

export interface FilterState {
  search: string;
  status: string;
  source: string;
  deadlineDays: string;
  amountRange: [number, number];
}

interface GrantFiltersSidebarProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: unknown) => void;
  onClearFilters: () => void;
  sources: string[];
  isLoading?: boolean;
}

export function GrantFiltersSidebar({
  filters,
  onFilterChange,
  onClearFilters,
  sources,
  isLoading,
}: GrantFiltersSidebarProps) {
  const { t } = useTranslation();

  const hasActiveFilters =
    filters.search ||
    filters.status !== "open,upcoming" ||
    filters.source !== "all" ||
    filters.deadlineDays !== "all" ||
    filters.amountRange[0] > 0 ||
    filters.amountRange[1] < 50000000;

  const formatAmount = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toString();
  };

  return (
    <div className="space-y-6" data-testid="grant-filters-sidebar">
      <div>
        <Label className="text-sm font-medium mb-2 block">{t('filters.search')}</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('filters.searchPlaceholder')}
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="pl-9"
            data-testid="input-search-grants"
          />
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium mb-2 block">{t('filters.status')}</Label>
        <div className="flex flex-wrap gap-1.5" data-testid="status-filter-pills">
          {[
            { value: "open,upcoming", label: t('filters.openUpcoming') },
            { value: "open", label: t('filters.open') },
            { value: "upcoming", label: t('filters.upcoming') },
            { value: "closed", label: t('filters.closed') },
            { value: "all", label: t('common.all') },
          ].map((opt) => (
            <Button
              key={opt.value}
              variant={filters.status === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange("status", opt.value)}
              data-testid={`button-status-${opt.value.replace(',', '-')}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block">{t('filters.source')}</Label>
        <Select
          value={filters.source}
          onValueChange={(value) => onFilterChange("source", value)}
        >
          <SelectTrigger data-testid="select-source-filter">
            <SelectValue placeholder={t('filters.selectSource')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allSources')}</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {t('filters.deadline')}
        </Label>
        <Select
          value={filters.deadlineDays}
          onValueChange={(value) => onFilterChange("deadlineDays", value)}
        >
          <SelectTrigger data-testid="select-deadline-filter">
            <SelectValue placeholder={t('filters.selectTimeframe')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="7">{t('filters.within7Days')}</SelectItem>
            <SelectItem value="30">{t('filters.within30Days')}</SelectItem>
            <SelectItem value="60">{t('filters.within60Days')}</SelectItem>
            <SelectItem value="90">{t('filters.within90Days')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
          <Banknote className="h-4 w-4" />
          {t('filters.amount')}
        </Label>
        <div className="px-2">
          <Slider
            value={filters.amountRange}
            onValueChange={(value) => onFilterChange("amountRange", value)}
            max={50000000}
            step={100000}
            className="w-full"
            data-testid="slider-amount-range"
          />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{formatAmount(filters.amountRange[0])} SEK</span>
            <span>{formatAmount(filters.amountRange[1])} SEK</span>
          </div>
        </div>
      </div>

      <Separator />

      {hasActiveFilters && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('filters.activeFilters')}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-auto py-1 px-2 text-xs"
              data-testid="button-clear-all-filters"
            >
              <X className="h-3 w-3 mr-1" />
              {t('filters.clearAll')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {filters.search && (
              <Badge variant="secondary" className="text-xs">
                {t('filters.searchPrefix', { term: filters.search })}
              </Badge>
            )}
            {filters.status !== "open,upcoming" && (
              <Badge variant="secondary" className="text-xs">
                {filters.status === "open"
                  ? t('filters.open')
                  : filters.status === "upcoming"
                  ? t('filters.upcoming')
                  : filters.status === "closed"
                  ? t('filters.closed')
                  : t('common.all')}
              </Badge>
            )}
            {filters.source !== "all" && (
              <Badge variant="secondary" className="text-xs">
                {filters.source}
              </Badge>
            )}
            {filters.deadlineDays !== "all" && (
              <Badge variant="secondary" className="text-xs">
                {filters.deadlineDays} {t('common.days')}
              </Badge>
            )}
            {(filters.amountRange[0] > 0 || filters.amountRange[1] < 50000000) && (
              <Badge variant="secondary" className="text-xs">
                {formatAmount(filters.amountRange[0])} - {formatAmount(filters.amountRange[1])}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
