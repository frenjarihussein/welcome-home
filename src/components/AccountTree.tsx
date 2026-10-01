import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";

type Acc = { id: string; code: string; name: string; parent_id: string | null; is_group: boolean; nature: string; currency: string };

export function AccountTree() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const list = useQuery({
    queryKey: ["accounts_tree", me?.tenantId],
    enabled: !!me,
    queryFn: async () =>
      ((await scope(db.from("accounts").select("id,code,name,parent_id,is_group,nature,currency"), me?.tenantId).order("code")).data ?? []) as Acc[],
  });
  const children = useMemo(() => {
    const m: Record<string, Acc[]> = {};
    const ids = new Set((list.data ?? []).map((a) => a.id));
    (list.data ?? []).forEach((a) => {
      const k = a.parent_id && ids.has(a.parent_id) ? a.parent_id : "root";
      (m[k] ??= []).push(a);
    });
    return m;
  }, [list.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["accounts_tree"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  };
  const add = useMutation({
    mutationFn: async (parent: Acc | null) => {
      const sib = children[parent?.id ?? "root"] ?? [];
      const suggested = parent ? `${parent.code}${String(sib.length + 1).padStart(2, "0")}` : "";
      const code = window.prompt("رمز الحساب الجديد", suggested);
      if (!code) return false;
      const name = window.prompt("اسم الحساب");
      if (!name) return false;
      const { error } = await db.from("accounts").insert({
        tenant_id: me!.tenantId, code, name, parent_id: parent?.id ?? null, is_group: false,
        nature: parent?.nature ?? "balance_sheet", currency: parent?.currency ?? "USD",
      });
      if (error) throw error;
      if (parent && !parent.is_group) await db.from("accounts").update({ is_group: true }).eq("id", parent.id);
      if (parent) setOpen((o) => ({ ...o, [parent.id]: true }));
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تمت إضافة الحساب"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const rename = useMutation({
    mutationFn: async (a: Acc) => {
      const name = window.prompt("اسم الحساب", a.name);
      if (!name || name === a.name) return false;
      const { error } = await db.from("accounts").update({ name }).eq("id", a.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تم التعديل"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (a: Acc) => {
      if (children[a.id]?.length) throw new Error("لا يمكن حذف حساب له حسابات فرعية");
      if (!window.confirm(`حذف الحساب ${a.code} - ${a.name}؟`)) return false;
      const { count } = await db.from("journal_lines").select("id", { count: "exact", head: true }).eq("account_id", a.id);
      if (count) throw new Error("لا يمكن حذف حساب له حركات محاسبية، يمكنك إلغاء تفعيله");
      const { error } = await db.from("accounts").delete().eq("id", a.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (ok) => { if (ok) { toast.success("تم الحذف"); refresh(); } },
    onError: (e: Error) => toast.error(e.message),
  });

  const canC = can(me, "accounts", "create");
  const canE = can(me, "accounts", "edit");
  const canD = can(me, "accounts", "delete");

  function Node({ a, depth }: { a: Acc; depth: number }) {
    const kids = children[a.id] ?? [];
    const isOpen = open[a.id] ?? depth < 1;
    return (
      <li>
        <div className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted" style={{ paddingInlineStart: depth * 20 }}>
          <button type="button" className="size-5 text-muted-foreground" onClick={() => setOpen({ ...open, [a.id]: !isOpen })} disabled={!kids.length}>
            {kids.length ? (isOpen ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />) : <span className="inline-block size-1.5 rounded-full bg-muted-foreground" />}
          </button>
          <span className="num text-xs text-muted-foreground">{a.code}</span>
          <span className={kids.length || a.is_group ? "font-semibold" : ""}>{a.name}</span>
          <span className="ms-auto flex gap-1 opacity-0 group-hover:opacity-100">
            {canC && <Button size="icon" variant="ghost" className="size-7" title="إضافة حساب فرعي" onClick={() => add.mutate(a)}><Plus className="size-4" /></Button>}
            {canE && <Button size="icon" variant="ghost" className="size-7" title="تعديل الاسم" onClick={() => rename.mutate(a)}><Pencil className="size-4" /></Button>}
            {canD && <Button size="icon" variant="ghost" className="size-7 text-destructive" title="حذف" onClick={() => remove.mutate(a)}><Trash2 className="size-4" /></Button>}
          </span>
        </div>
        {isOpen && kids.length > 0 && (
          <ul className="border-s border-dashed" style={{ marginInlineStart: depth * 20 + 10 }}>
            {kids.map((k) => <Node key={k.id} a={k} depth={0} />)}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="mb-8 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">الشجرة المرسومة للحسابات</h2>
        {canC && <Button size="sm" variant="outline" onClick={() => add.mutate(null)}><Plus className="size-4" />حساب رئيسي</Button>}
      </div>
      {list.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحميل...</p> : (
        <ul className="max-h-[480px] overflow-y-auto text-sm">
          {(children["root"] ?? []).map((a) => <Node key={a.id} a={a} depth={0} />)}
        </ul>
      )}
    </div>
  );
}
