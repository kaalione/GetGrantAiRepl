import { Search, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GrantFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  sourceTypeFilter: string;
  onSourceTypeChange: (value: string) => void;
  onClearFilters: () => void;
}

export function GrantFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sourceTypeFilter,
  onSourceTypeChange,
  onClearFilters,
}: GrantFiltersProps) {
  const hasActiveFilters = searchQuery || statusFilter !== "all" || sourceTypeFilter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Sök bidrag..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-search-grants"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla status</SelectItem>
              <SelectItem value="open">Öppen</SelectItem>
              <SelectItem value="upcoming">Kommande</SelectItem>
              <SelectItem value="closed">Stängd</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceTypeFilter} onValueChange={onSourceTypeChange}>
            <SelectTrigger className="w-[160px]" data-testid="select-source-type-filter">
              <SelectValue placeholder="Källa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla källor</SelectItem>
              <SelectItem value="myndighet">Myndighet</SelectItem>
              <SelectItem value="stiftelse">Stiftelse</SelectItem>
              <SelectItem value="eu">EU</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={onClearFilters} data-testid="button-clear-filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Aktiva filter:</span>
          {searchQuery && (
            <Badge variant="secondary" className="gap-1">
              Sök: "{searchQuery}"
              <button onClick={() => onSearchChange("")} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Status: {statusFilter === "open" ? "Öppen" : statusFilter === "upcoming" ? "Kommande" : "Stängd"}
              <button onClick={() => onStatusChange("all")} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {sourceTypeFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Källa: {sourceTypeFilter === "myndighet" ? "Myndighet" : sourceTypeFilter === "stiftelse" ? "Stiftelse" : "EU"}
              <button onClick={() => onSourceTypeChange("all")} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
