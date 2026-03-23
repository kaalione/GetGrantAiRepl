import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function GrantCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-4" />
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-14" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
      <div className="px-6 pt-3 pb-6 border-t flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-8" />
      </div>
    </Card>
  );
}

export function StatsCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-8 w-24" />
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

export function ApplicationListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-12" />
        </div>
        <Skeleton className="h-5 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-3" />
        <Skeleton className="h-4 w-28" />
      </CardContent>
    </Card>
  );
}
