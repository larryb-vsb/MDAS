import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SystemMessage {
  id: number;
  title: string;
  message: string;
  color: string;
  isActive: boolean;
  showPopup: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  red: { bg: "bg-red-500", text: "text-white", border: "border-red-600" },
  orange: { bg: "bg-orange-500", text: "text-white", border: "border-orange-600" },
  yellow: { bg: "bg-yellow-400", text: "text-black", border: "border-yellow-500" },
  green: { bg: "bg-green-500", text: "text-white", border: "border-green-600" },
  blue: { bg: "bg-blue-500", text: "text-white", border: "border-blue-600" },
  grey: { bg: "bg-gray-500", text: "text-white", border: "border-gray-600" },
  white: { bg: "bg-white", text: "text-black", border: "border-gray-300" },
};

function getColorClasses(color: string) {
  return COLORS[color] || COLORS.blue;
}

export function SystemMessageBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupShownForId, setPopupShownForId] = useState<number | null>(null);

  const { data } = useQuery<{ message: SystemMessage | null }>({
    queryKey: ["/api/system-messages/active"],
    refetchInterval: 60000, // Refresh every minute
  });

  const message = data?.message;

  useEffect(() => {
    if (message && message.showPopup) {
      const shownKey = `system_message_popup_${message.id}`;
      const hasBeenShown = localStorage.getItem(shownKey);
      
      if (!hasBeenShown && popupShownForId !== message.id) {
        setShowPopup(true);
        setPopupShownForId(message.id);
        localStorage.setItem(shownKey, "true");
      }
    }
  }, [message, popupShownForId]);

  useEffect(() => {
    if (message) {
      setDismissed(false);
    }
  }, [message?.id]);

  if (!message || dismissed) {
    return null;
  }

  const colors = getColorClasses(message.color);

  return (
    <>
      <div className={`${colors.bg} ${colors.text} ${colors.border} border-b px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-semibold">{message.title}</span>
            <span className="mx-2">—</span>
            <span>{message.message}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className={`${colors.text} hover:bg-black/10 p-1 h-auto`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={showPopup} onOpenChange={setShowPopup}>
        <DialogContent className={`${colors.bg} ${colors.text} ${colors.border} border-2`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {message.title}
            </DialogTitle>
            <DialogDescription className={colors.text}>
              {message.message}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => setShowPopup(false)}
              className="bg-white/20 hover:bg-white/30 border-white/50"
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
