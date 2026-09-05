import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type PermissionStatus,
} from "@capacitor/local-notifications";

const DAILY_STREAK_REMINDER_ID = 903;
const DAILY_STREAK_CHANNEL_ID = "daily-streak-reminders";
let channelCreated = false;

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

async function getGrantedNotificationPermission(): Promise<PermissionStatus["display"] | null> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "prompt") {
    const requested = await LocalNotifications.requestPermissions();
    return requested.display;
  }
  return current.display;
}

export async function syncDailyStreakReminder({
  hasActiveStreak,
  hasLoggedToday,
}: {
  hasActiveStreak: boolean;
  hasLoggedToday: boolean;
}) {
  if (!isNativeApp()) return;

  try {
    const permission = await getGrantedNotificationPermission();
    if (permission !== "granted") return;

    if (!channelCreated) {
      await LocalNotifications.createChannel({
        id: DAILY_STREAK_CHANNEL_ID,
        name: "Daily streak reminders",
        description: "Reminders that help keep your nutrition streak going.",
        importance: 5,
        visibility: 1,
        sound: "default",
      });
      channelCreated = true;
    }

    if (!hasActiveStreak || hasLoggedToday) {
      await LocalNotifications.cancel({
        notifications: [{ id: DAILY_STREAK_REMINDER_ID }],
      });
      return;
    }

    await LocalNotifications.cancel({
      notifications: [{ id: DAILY_STREAK_REMINDER_ID }],
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_STREAK_REMINDER_ID,
          title: "Keep your MacroCount streak going",
          body: "You have not logged a meal today. A quick check-in keeps your momentum alive.",
          channelId: DAILY_STREAK_CHANNEL_ID,
          schedule: {
            on: {
              hour: 20,
              minute: 0,
            },
            allowWhileIdle: true,
          },
          extra: {
            route: "/log",
          },
        },
      ],
    });
  } catch (error) {
    console.warn("Unable to schedule the daily streak reminder.", error);
  }
}

export async function cancelDailyStreakReminder() {
  if (!isNativeApp()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: DAILY_STREAK_REMINDER_ID }],
    });
  } catch (error) {
    console.warn("Unable to cancel the daily streak reminder.", error);
  }
}