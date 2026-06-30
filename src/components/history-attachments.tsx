import { Button } from "@/components/ui/button";
import { Paperclip, Lock } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getHistoryAttachmentUrl, type HistoryAttachment } from "@/lib/employee-history.functions";

export function HistoryAttachments({ employeeId, attachments }: { employeeId: string; attachments?: HistoryAttachment[] }) {
  const sign = useServerFn(getHistoryAttachmentUrl);
  if (!attachments?.length) return null;
  const open = async (a: HistoryAttachment) => {
    try {
      const { url } = await sign({ data: { employee_id: employeeId, bucket: a.bucket, path: a.path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {attachments.map((a) => (
        <Button key={a.id} variant="outline" size="sm" className="h-7 text-xs" onClick={() => open(a)} title={a.path}>
          {a.sensitive ? <Lock className="h-3 w-3 mr-1" /> : <Paperclip className="h-3 w-3 mr-1" />}
          <span className="truncate max-w-[18ch]">{a.title}</span>
        </Button>
      ))}
    </div>
  );
}