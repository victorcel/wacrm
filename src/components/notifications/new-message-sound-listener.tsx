"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import type { Message } from "@/types";

/**
 * Headless, app-wide listener for inbound WhatsApp messages. Mounted
 * once in the dashboard shell (like PresenceHeartbeat) so the
 * notification sound plays regardless of which page the user is on,
 * not just while /inbox is open. Own realtime channel — same pattern
 * as useTotalUnread/useUnreadNotifications — so it doesn't interfere
 * with the inbox page's "inbox-realtime" channel.
 */
export function NewMessageSoundListener() {
  const { play } = useNotificationSound();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("new-message-sound")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.sender_type === "customer") {
            play();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [play]);

  return null;
}
