import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, UserPlus, Search, MoreHorizontal, RefreshCw, Ban, Trash2, ChevronLeft, ChevronRight, Mail } from "lucide-react";
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
}

interface ClientsResponse {
  clients: PartnerClient[];
  total: number;
  limit: number;
  offset: number;
}

const inviteFormSchema = z.object({
  email: z.string().email("Ange en giltig e-postadress"),
  name: z.string().optional(),
  companyName: z.string().optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

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

  const clients = data?.clients || [];
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
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-clients-title">Kunder</h1>
            <p className="text-muted-foreground" data-testid="text-clients-subtitle">
              Hantera och bjud in kunder till din partnerportal.
            </p>
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
                        <TableHead>Namn</TableHead>
                        <TableHead>E-post</TableHead>
                        <TableHead>Företag</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Registrerad</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((client) => (
                        <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                          <TableCell className="font-medium">{client.name || "—"}</TableCell>
                          <TableCell>{client.email}</TableCell>
                          <TableCell>{client.companyName || "—"}</TableCell>
                          <TableCell>
                            <StatusBadge status={client.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {client.createdAt
                              ? format(new Date(client.createdAt), "d MMM yyyy", { locale: sv })
                              : "—"}
                          </TableCell>
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
