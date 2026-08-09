// Native haptics for the iOS app (Capacitor). In a plain browser these are
// silent no-ops — the Haptics plugin only does real work on device.

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const isNativeApp = Capacitor.isNativePlatform();

/** A die striking the tray — small tick, medium for hard hits. */
export function impactHaptic(hard) {
  if (!isNativeApp) return;
  Haptics.impact({ style: hard ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}

/** The roll resolves. kind: 'crit' | 'fumble' | 'normal' */
export function resultHaptic(kind) {
  if (!isNativeApp) return;
  if (kind === 'crit') Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else if (kind === 'fumble') Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  else Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
