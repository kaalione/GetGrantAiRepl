import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonEditor } from "./json-editor";
import { insertScraperSourceSchema } from "@shared/schema";
import type { ScraperSource } from "@shared/schema";
import { z } from "zod";
import { Save, Loader2 } from "lucide-react";

const formSchema = insertScraperSourceSchema.extend({
  name: z.string().min(1, "Namn krävs"),
  url: z.string().url("Ogiltig URL"),
  type: z.enum(["api", "scrape"]),
  scraperType: z.enum(["playwright", "beautifulsoup", "api"]).optional().nullable(),
  updateFrequency: z.enum(["daily", "weekly"]).default("daily"),
  active: z.boolean().default(true),
  selectors: z.string().optional(),
  apiKey: z.string().optional(),
  headers: z.string().optional(),
});

export type SourceFormData = z.infer<typeof formSchema>;

interface SourceFormProps {
  defaultValues?: Partial<ScraperSource>;
  onSubmit: (data: SourceFormData) => void;
  isPending?: boolean;
  submitLabel?: string;
}

export function SourceForm({ defaultValues, onSubmit, isPending, submitLabel = "Spara" }: SourceFormProps) {
  const form = useForm<SourceFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      url: defaultValues?.url || "",
      type: (defaultValues?.type as "api" | "scrape") || "scrape",
      scraperType: defaultValues?.scraperType as "playwright" | "beautifulsoup" | "api" | undefined,
      updateFrequency: (defaultValues?.updateFrequency as "daily" | "weekly") || "daily",
      active: defaultValues?.active ?? true,
      selectors: defaultValues?.selectors ? JSON.stringify(defaultValues.selectors, null, 2) : "",
      apiKey: "",
      headers: "",
    },
  });

  const selectedType = form.watch("type");

  const handleSubmit = (data: SourceFormData) => {
    const cleanedData = {
      ...data,
      selectors: data.selectors ? JSON.parse(data.selectors) : undefined,
      scraperType: data.type === "scrape" ? data.scraperType : undefined,
    };
    onSubmit(cleanedData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Namn</FormLabel>
              <FormControl>
                <Input placeholder="T.ex. Vinnova" {...field} data-testid="input-source-name" />
              </FormControl>
              <FormDescription>Ett beskrivande namn för datakällan</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/api/grants" {...field} data-testid="input-source-url" />
              </FormControl>
              <FormDescription>API-endpoint eller webbsida att skrapa</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Typ</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} data-testid="select-source-type">
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj typ" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="scrape">Webbskrapning</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="updateFrequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Uppdateringsfrekvens</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} data-testid="select-update-frequency">
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj frekvens" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="daily">Dagligen</SelectItem>
                    <SelectItem value="weekly">Veckovis</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {selectedType === "scrape" && (
          <>
            <FormField
              control={form.control}
              name="scraperType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Skrapartyp</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""} data-testid="select-scraper-type">
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Välj skrapartyp" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="playwright">Playwright (JavaScript-rendering)</SelectItem>
                      <SelectItem value="beautifulsoup">BeautifulSoup (Statisk HTML)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Välj Playwright för dynamiska sidor, BeautifulSoup för statiska</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="selectors"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CSS-selektorer (JSON)</FormLabel>
                  <FormControl>
                    <JsonEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder={'{\n  "title_selector": ".grant-title",\n  "description_selector": ".grant-desc",\n  "deadline_selector": ".deadline",\n  "url_selector": ".grant-link"\n}'}
                    />
                  </FormControl>
                  <FormDescription>
                    Definiera CSS-selektorer för att extrahera data från webbsidan
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {selectedType === "api" && (
          <>
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API-nyckel</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="Din API-nyckel" 
                      {...field} 
                      data-testid="input-api-key" 
                    />
                  </FormControl>
                  <FormDescription>API-nyckeln krypteras innan den sparas</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="headers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HTTP Headers (JSON)</FormLabel>
                  <FormControl>
                    <JsonEditor
                      value={field.value || ""}
                      onChange={field.onChange}
                      placeholder={'{\n  "Authorization": "Bearer token",\n  "Content-Type": "application/json"\n}'}
                    />
                  </FormControl>
                  <FormDescription>Extra HTTP-headers för API-anrop</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Aktiv</FormLabel>
                <FormDescription>
                  Aktivera automatisk datahämtning enligt schemat
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-active"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} data-testid="button-submit-source">
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sparar...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {submitLabel}
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
