import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function NotificationBell({ className }: { className?: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", me?.userId],
    enabled: !!me,
    refetchInterval: 120_000,
    queryFn: async () =>
      (await db.from("notifications").select("*").order("created_at", { ascending: false }).limit(30)).data ?? [],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = q.data ?? [];
  const seen = me?.notifSeenAt ? new Date(me.notifSeenAt).getTime() : 0;
  const unread = list.filter((n) => new Date(n.created_at).getTime() > seen).length;

  return (
    <Popover
      onOpenChange={async (open) => {
        if (!open && unread > 0) {
          await db.rpc("mark_notifications_seen");
          qc.invalidateQueries({ queryKey: ["me"] });
        }
      }}
    >
      <PopoverTrigger asChild>
        <button className={`relative rounded-md p-2 hover:bg-sidebar-accent ${className ?? ""}`} aria-label="الإشعارات">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -left-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-96 w-80 overflow-y-auto p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">الإشعارات</div>
        {list.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد إشعارات</p>}
        {list.map((n) => (
          <div
            key={n.id}
            className={`border-b px-3 py-2 text-sm ${new Date(n.created_at).getTime() > seen ? "bg-accent/40" : ""}`}
          >
            <div className="font-semibold">{n.title}</div>
            {n.body && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{n.body}</p>}
            <div className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
