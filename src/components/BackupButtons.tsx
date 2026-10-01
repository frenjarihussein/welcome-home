import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { backupCompany } from "@/lib/admin.functions";
import { downloadBackupXlsx, readBackupXlsx, SHEET_AR } from "@/lib/backup";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";

export function BackupButtons({ tenantId, name }: { tenantId: string; name: string }) {
  const backupFn = useServerFn(backupCompany);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function doBackup() {
    setBusy(true);
    try {
      const json = await backupFn({ data: { tenantId } });
      const parsed = JSON.parse(json);
      downloadBackupXlsx(parsed.data, `نسخة-احتياطية-${name}-${new Date().toISOString().slice(0, 10)}`);
      toast.success("تم تنزيل النسخة الاحتياطية (ملف Excel)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data = await readBackupXlsx(file);
      const summary = Object.entries(data)
        .filter(([t]) => SHEET_AR[t])
        .map(([t, rows]) => `${SHEET_AR[t]}: ${rows.length}`)
        .join("\n");
      if (!data["accounts"]) throw new Error("الملف لا يبدو نسخة احتياطية صالحة من البرنامج");
      const ok = window.confirm(
        `سيتم استبدال كل بيانات شركة "${name}" المحاسبية بمحتوى النسخة:\n\n${summary}\n\n(المستخدمون والاشتراك لا يتغيرون). متابعة؟`,
      );
      if (!ok) return;
      const { error } = await db.rpc("restore_tenant", { _id: tenantId, _data: data });
      if (error) throw error;
      toast.success("تم استرجاع النسخة الاحتياطية بنجاح");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={doBackup}>
        <Download className="size-4" />
        نسخة احتياطية
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload className="size-4" />
        استرجاع نسخة
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => doRestore(e.target.files?.[0])}
      />
    </>
  );
}
