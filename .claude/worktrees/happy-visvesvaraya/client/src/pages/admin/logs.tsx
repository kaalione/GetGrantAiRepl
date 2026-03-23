import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Filter, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEO } from '@/components/seo';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowSkeleton } from "@/components/loading-skeleton";
import { EmptyState } from "@/components/grants/empty-state";
import type { ScraperLog, ScraperSource } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { queryClient } from "@/lib/queryClient";

export default function AdminLogs() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data: logs, isLoading: logsLoading } = useQuery<ScraperLog[]>({
    queryKey: ["/api/scraper-logs"],
  });

  const { data: sources } = useQuery<ScraperSource[]>({
    queryKey: ["/api/scraper-sources"],
  });

  const filteredLogs = logs?.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (sourceFilter !== "all" && log.sourceId !== sourceFilter) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Lyckad
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <XCircle className="h-3 w-3 mr-1" />
            Fel
          </Badge>
        );
      case "running":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Körs
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-gray-600 border-gray-600">
            <Clock className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const getSourceName = (sourceId: string) => {
    const source = sources?.find((s) => s.id === sourceId);
    return source?.name || "Okänd källa";
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/scraper-logs"] });
  };

  return (
    <div className="space-y-6">
      <SEO title="Admin - Loggar" noindex={true} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-logs-title">
            Skraparloggar
          </h1>
          <p className="text-muted-foreground mt-1">
            Övervaka och felsök datahämtning från alla källor
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh-logs">
          <RefreshCw className="mr-2 h-4 w-4" />
          Uppdatera
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Körningshistorik
              </CardTitle>
              <CardDescription>
                {filteredLogs?.length || 0} logginlägg
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    <SelectItem value="success">Lyckad</SelectItem>
                    <SelectItem value="error">Fel</SelectItem>
                    <SelectItem value="running">Körs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-source-filter">
                  <SelectValue placeholder="Källa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla källor</SelectItem>
                  {sources?.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidpunkt</TableHead>
                  <TableHead>Källa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bidrag hittade</TableHead>
                  <TableHead>Meddelande</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRowSkeleton columns={5} />
                <TableRowSkeleton columns={5} />
                <TableRowSkeleton columns={5} />
              </TableBody>
            </Table>
          ) : filteredLogs && filteredLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidpunkt</TableHead>
                  <TableHead>Källa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bidrag hittade</TableHead>
                  <TableHead>Meddelande</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {log.scrapedAt
                            ? format(new Date(log.scrapedAt), "yyyy-MM-dd HH:mm", { locale: sv })
                            : "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {log.scrapedAt
                            ? formatDistanceToNow(new Date(log.scrapedAt), {
                                addSuffix: true,
                                locale: sv,
                              })
                            : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getSourceName(log.sourceId)}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{log.grantsFound || 0}</span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {log.errorMessage ? (
                        <span className="text-red-600 text-sm truncate block">
                          {log.errorMessage}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="Inga loggar"
              description="Det finns inga skraparloggar att visa. Kör en datakälla för att se loggar här."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
