import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, UserPlus, Search, MoreHorizontal, RefreshCw, Ban, Trash2, ChevronLeft, ChevronRight, Mail, Target } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { SEO } from "@/components/seo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface PartnerClient {
  id: number;
  name: string;
  email: string;
  companyName?: string;
  status: string;
  createdAt: string;
  pursuits?: number;
  openApplications?: number;
  approvedThisYearSek?: number;
  bestMatch?: { grantId: string; title: string; score: number } | null;
  nextDeadline?: { grantId: string; title: string; deadline: string } | null;
}

interface ClientsResponse {
  clients: PartnerClient[];
  total: number;
  limit: number;
  offset: number;
  summary?: {
    totalActive: number;
    totalInvited: number;
    totalGrantValueSek: number;
    totalPursuits: number;
    totalOpenApplications: number;
    approvedThisYearSek: number;
  };
}

interface PartnerProfile {
  companyName: string;
  plan: string;
  maxClients: number | null;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

function formatSek(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} mkr`;
  if (value >= 1000) return `${Math.round(value / 1000).toLocaleString("sv-SE")} tkr`;
  return `${value.toLocaleString("sv-SE")} kr`;
}

const inviteFormSchema = z.object({
  email: z.string().email("Ange en giltig e-postadress"),
  name: z.string().optional(),
  companyName: z.string().optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

const pursuitFormSchema = z.object({
  clientId: z.string().min(1, "Välj en klient"),
  name: z.string().min(1, "Ge satsningen ett namn").max(120),
  description: z.string().max(4000).optional(),
  goals: z.string().max(4000).optional(),
  budgetSek: z.string().optional(),
  timeframe: z.string().max(120).optional(),
  keywords: z.string().optional(),
});

type PursuitFormValues = z.infer<typeof pursuitFormSchema>;

const PAGE_SIZE = 50;

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );
}

/**
 * A date alone makes the consultant do the arithmetic; the count of days left is
 * the part that decides whether this client is today's work.
 */
function DeadlineCell({ deadline }: { deadline: string }) {
  const date = new Date(deadline);
  const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const urgent = days <= 14;
  return (
    <div>
      <div className="tabular-nums">{format(date, "d MMM yyyy", { locale: sv })}</div>
      <div className={urgent ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
        {days <= 0 ? "I dag" : days === 1 ? "1 dag kvar" : `${days} dagar kvar`}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "outline" | "destructive" | "secondary" }> = {
    active: { label: "Aktiv", variant: "default" },
    invited: { label: "Inbjuden", variant: "outline" },
    blocked: { label: "Blockerad", variant: "destructive" },
    inactive: { label: "Inaktiv", variant: "secondary" },
  };

  const { label, variant } = config[status] || { label: status, variant: "secondary" as const };

  return <Badge variant={variant} data-testid={`badge-status-${status}`}>{label}</Badge>;
}

export default function PartnerClients() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pursuitDialogOpen, setPursuitDialogOpen] = useState(false);

  const pursuitForm = useForm<PursuitFormValues>({
    resolver: zodResolver(pursuitFormSchema),
    defaultValues: { clientId: "", name: "", description: "", goals: "", budgetSek: "", timeframe: "", keywords: "" },
  });

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      name: "",
      companyName: "",
    },
  });

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (search) queryParams.set("search", search);
  queryParams.set("limit", String(PAGE_SIZE));
  queryParams.set("offset", String(offset));

  const { data, isLoading } = useQuery<ClientsResponse>({
    queryKey: ["/api/partner/clients", `?${queryParams.toString()}`],
  });

  const { data: partner } = useQuery<PartnerProfile>({
    queryKey: ["/api/partner/profile"],
  });

  const summary = data?.summary;
  const clients = data?.clients || [];
  const activeClients = clients.filter((c) => c.status === "active");
  const total = data?.total || 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const inviteMutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      await apiRequest("POST", "/api/partner/clients/invite", values);
    },
    onSuccess: () => {
      toast({ title: "Inbjudan skickad", description: "Kunden har fått en inbjudan via e-post." });
      form.reset();
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/partner/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const pursuitMutation = useMutation({
    mutationFn: async (values: PursuitFormValues) => {
      const budget = values.budgetSek?.replace(/\s/g, "");
      await apiRequest("POST", `/api/partner/clients/${values.clientId}/profiles`, {
        name: values.name,
        description: values.description || null,
        goals: values.goals || null,
        timeframe: values.timeframe || null,
        budgetSek: budget ? Number(budget) : null,
        keywords: values.keywords
          ? values.keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : null,
      });
    },
    onSuccess: () => {
      toast({
        title: "Satsning skapad",
        description: "Klienten ser satsningen i sitt konto, med er som avsändare.",
      });
      pursuitForm.reset();
      setPursuitDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/partner/clients"] });
    },
    onError: (error: any) => {
      toast({
        title: "Kunde inte skapa satsningen",
        description: error?.message || "Försök igen.",
        variant: "destructive",
      });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (clientId: number) => {
      await apiRequest("POST", `/api/partner/clients/invite/resend/${clientId}`);
    },
    onSuccess: () => {
      toast({ title: "Inbjudan skickad igen", description: "En ny inbjudan har skickats." });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (clientId: number) => {
      await apiRequest("POST", `/api/partner/clients/${clientId}/block`);
    },
    onSuccess: () => {
      toast({ title: "Kund blockerad", description: "Kunden har blockerats." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (clientId: number) => {
      await apiRequest("DELETE", `/api/partner/clients/${clientId}`);
    },
    onSuccess: () => {
      toast({ title: "Kund borttagen", description: "Kunden har tagits bort." });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner/analytics"] });
    },
    onError: (error: Error) => {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    },
  });

  function onInviteSubmit(values: InviteFormValues) {
    inviteMutation.mutate(values);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setOffset(0);
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setOffset(0);
  }

  return (
    <>
      <SEO title="Kunder - Partner" description="Hantera dina partnerkunder" noindex={true} />
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-clients-title">Klientportfölj</h1>
            <p className="text-muted-foreground" data-testid="text-clients-subtitle">
              {partner?.companyName
                ? `Konsultvy — ${partner.companyName}. Allt ni gör i klientkonton loggas.`
                : "Konsultvy. Allt ni gör i klientkonton loggas."}
            </p>
            {partner && (
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-clients-plan">
                {PLAN_LABELS[partner.plan] ?? partner.plan}
                {partner.maxClients ? ` · ${total} av ${partner.maxClients} klienter` : ` · ${total} klienter`}
              </p>
            )}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-invite-client">
                <UserPlus className="mr-2 h-4 w-4" />
                Bjud in kund
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bjud in ny kund</DialogTitle>
                <DialogDescription>
                  Skicka en inbjudan till en ny kund via e-post.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onInviteSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-post *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="kund@foretag.se"
                            data-testid="input-invite-email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Namn</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Förnamn Efternamn"
                            data-testid="input-invite-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Företagsnamn</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Företag AB"
                            data-testid="input-invite-company"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={inviteMutation.isPending}
                      data-testid="button-send-invite"
                    >
                      {inviteMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Skickar...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Skicka inbjudan
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={pursuitDialogOpen} onOpenChange={setPursuitDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-new-client-pursuit">
                <Target className="mr-2 h-4 w-4" />
                Ny satsning åt klient
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ny satsning åt klient</DialogTitle>
                <DialogDescription>
                  Satsningen skapas i klientens konto med er som avsändare, och styr vilka
                  utlysningar de matchas mot.
                </DialogDescription>
              </DialogHeader>
              <Form {...pursuitForm}>
                <form
                  onSubmit={pursuitForm.handleSubmit((values) => pursuitMutation.mutate(values))}
                  className="space-y-4"
                >
                  <FormField
                    control={pursuitForm.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Klient</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-pursuit-client">
                              <SelectValue placeholder="Välj klient" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeClients.length === 0 ? (
                              <div className="px-2 py-3 text-sm text-muted-foreground">
                                Inga aktiva klienter än
                              </div>
                            ) : (
                              activeClients.map((client) => (
                                <SelectItem key={client.id} value={String(client.id)}>
                                  {client.companyName || client.name || client.email}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pursuitForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Namn på satsningen</FormLabel>
                        <FormControl>
                          <Input placeholder="Elektrifiering av produktionslinjen" data-testid="input-pursuit-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pursuitForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vad ska göras?</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Kort beskrivning av projektet." data-testid="input-pursuit-description" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pursuitForm.control}
                    name="goals"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mål</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Vad ska satsningen leda till?" data-testid="input-pursuit-goals" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={pursuitForm.control}
                      name="budgetSek"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Budget (kr)</FormLabel>
                          <FormControl>
                            <Input inputMode="numeric" placeholder="2 000 000" data-testid="input-pursuit-budget" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={pursuitForm.control}
                      name="timeframe"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tidsram</FormLabel>
                          <FormControl>
                            <Input placeholder="18 månader" data-testid="input-pursuit-timeframe" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={pursuitForm.control}
                    name="keywords"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nyckelord</FormLabel>
                        <FormControl>
                          <Input placeholder="elektrifiering, produktion, energieffektivisering" data-testid="input-pursuit-keywords" {...field} />
                        </FormControl>
                        <FormDescription>Separera med kommatecken.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={pursuitMutation.isPending} data-testid="button-save-pursuit">
                      {pursuitMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Sparar...
                        </>
                      ) : (
                        "Skapa satsning"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Aktiva klienter"
            value={summary ? String(summary.totalActive) : "—"}
            hint={summary && summary.totalInvited > 0 ? `${summary.totalInvited} inbjudna` : undefined}
            testId="stat-active-clients"
          />
          <StatCard
            label="Satsningar ni skapat"
            value={summary ? String(summary.totalPursuits) : "—"}
            testId="stat-pursuits"
          />
          <StatCard
            label="Pågående ansökningar"
            value={summary ? String(summary.totalOpenApplications) : "—"}
            testId="stat-open-applications"
          />
          <StatCard
            label="Beviljat i år"
            value={summary ? formatSek(summary.approvedThisYearSek) : "—"}
            testId="stat-approved"
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök kunder..."
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-clients"
                />
              </div>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filtrera status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla</SelectItem>
                  <SelectItem value="active">Aktiva</SelectItem>
                  <SelectItem value="invited">Inbjudna</SelectItem>
                  <SelectItem value="blocked">Blockerade</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton />
            ) : clients.length > 0 ? (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Klient</TableHead>
                        <TableHead className="w-[110px]">Satsningar</TableHead>
                        <TableHead>Bästa matchning</TableHead>
                        <TableHead>Nästa deadline</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((client) => (
                        <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                          <TableCell>
                            <div className="font-medium">
                              {client.companyName || client.name || client.email}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {client.companyName ? client.name || client.email : client.email}
                            </div>
                          </TableCell>
                          {client.status !== "active" ? (
                            <TableCell colSpan={3}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <StatusBadge status={client.status} />
                                {client.status === "invited" && (
                                  <>
                                    <span className="text-sm text-muted-foreground">
                                      Har inte tackat ja
                                      {client.createdAt
                                        ? ` — inbjuden ${format(new Date(client.createdAt), "d MMM", { locale: sv })}`
                                        : ""}
                                    </span>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => resendMutation.mutate(client.id)}
                                      disabled={resendMutation.isPending}
                                      data-testid={`button-remind-${client.id}`}
                                    >
                                      Skicka påminnelse
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          ) : (
                            <>
                              <TableCell data-testid={`text-pursuits-${client.id}`}>
                                {client.pursuits ?? 0}
                              </TableCell>
                              <TableCell>
                                {client.bestMatch ? (
                                  <div className="flex items-baseline gap-2">
                                    <span className="font-medium tabular-nums">
                                      {client.bestMatch.score} %
                                    </span>
                                    <span className="text-sm text-muted-foreground line-clamp-1">
                                      {client.bestMatch.title}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {client.pursuits ? "Ingen matchning än" : "Ingen satsning än"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {client.nextDeadline ? (
                                  <DeadlineCell deadline={client.nextDeadline.deadline} />
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </>
                          )}
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-actions-${client.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {client.status === "invited" && (
                                  <DropdownMenuItem
                                    onClick={() => resendMutation.mutate(client.id)}
                                    disabled={resendMutation.isPending}
                                    data-testid={`button-resend-${client.id}`}
                                  >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Skicka igen
                                  </DropdownMenuItem>
                                )}
                                {client.status !== "blocked" && (
                                  <DropdownMenuItem
                                    onClick={() => blockMutation.mutate(client.id)}
                                    disabled={blockMutation.isPending}
                                    data-testid={`button-block-${client.id}`}
                                  >
                                    <Ban className="mr-2 h-4 w-4" />
                                    Blockera
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => removeMutation.mutate(client.id)}
                                  disabled={removeMutation.isPending}
                                  className="text-destructive"
                                  data-testid={`button-remove-${client.id}`}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Ta bort
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
                    <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                      Visar {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} av {total} kunder
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Föregående
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Sida {currentPage} av {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={offset + PAGE_SIZE >= total}
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                        data-testid="button-next-page"
                      >
                        Nästa
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-1">Inga kunder hittades</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {search || statusFilter !== "all"
                    ? "Prova att ändra din sökning eller filter."
                    : "Bjud in din första kund för att komma igång."}
                </p>
                {!search && statusFilter === "all" && (
                  <Button onClick={() => setDialogOpen(true)} data-testid="button-invite-empty">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Bjud in kund
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
