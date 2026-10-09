/**
 * iOS supported-app catalog.
 *
 * iOS provides no general public API to enumerate installed applications
 * without Family Controls (deliberately postponed). This catalog is the
 * curated set of apps FocusLock supports — it must NEVER be presented as
 * "all installed apps". Availability is probed per-app via the URL schemes
 * already configured in app.json (LSApplicationQueriesSchemes).
 */
import type { SelectableApp } from './types';

export interface SupportedCatalogApp extends SelectableApp {
  platform: 'ios';
  bundleIdentifier: string;
}

export const SUPPORTED_IOS_APPS: SupportedCatalogApp[] = [
  // Social Media
  { id: 'instagram', name: 'Instagram', platform: 'ios', bundleIdentifier: 'com.burbn.instagram', category: 'Social', badgeCode: 'IG', color: '#E1306C', urlScheme: 'instagram://' },
  { id: 'tiktok', name: 'TikTok', platform: 'ios', bundleIdentifier: 'com.zhiliaoapp.musically', category: 'Social', badgeCode: 'TT', color: '#09090b', urlScheme: 'snssdk1233://' },
  { id: 'x_twitter', name: 'X / Twitter', platform: 'ios', bundleIdentifier: 'com.atebits.Tweetie2', category: 'Social', badgeCode: 'X', color: '#0f1419', urlScheme: 'twitter://' },
  { id: 'facebook', name: 'Facebook', platform: 'ios', bundleIdentifier: 'com.facebook.Facebook', category: 'Social', badgeCode: 'FB', color: '#1877F2', urlScheme: 'fb://' },
  { id: 'snapchat', name: 'Snapchat', platform: 'ios', bundleIdentifier: 'com.toyopagroup.picaboo', category: 'Social', badgeCode: 'SC', color: '#EAB308', urlScheme: 'snapchat://' },
  { id: 'reddit', name: 'Reddit', platform: 'ios', bundleIdentifier: 'com.reddit.Reddit', category: 'Social', badgeCode: 'RD', color: '#FF4500', urlScheme: 'reddit://' },
  { id: 'threads', name: 'Threads', platform: 'ios', bundleIdentifier: 'com.burbn.threads', category: 'Social', badgeCode: 'TH', color: '#09090b', urlScheme: 'barcelona://' },
  { id: 'pinterest', name: 'Pinterest', platform: 'ios', bundleIdentifier: 'pinterest', category: 'Social', badgeCode: 'PIN', color: '#E60023', urlScheme: 'pinterest://' },
  { id: 'linkedin', name: 'LinkedIn', platform: 'ios', bundleIdentifier: 'com.linkedin.LinkedIn', category: 'Social', badgeCode: 'IN', color: '#0A66C2', urlScheme: 'linkedin://' },

  // Video & Entertainment
  { id: 'youtube', name: 'YouTube', platform: 'ios', bundleIdentifier: 'com.google.ios.youtube', category: 'Video', badgeCode: 'YT', color: '#DC2626', urlScheme: 'youtube://' },
  { id: 'netflix', name: 'Netflix', platform: 'ios', bundleIdentifier: 'com.netflix.Netflix', category: 'Video', badgeCode: 'NFLX', color: '#E50914', urlScheme: 'nflx://' },
  { id: 'twitch', name: 'Twitch', platform: 'ios', bundleIdentifier: 'tv.twitch', category: 'Video', badgeCode: 'TW', color: '#9146FF', urlScheme: 'twitch://' },
  { id: 'disney_plus', name: 'Disney+', platform: 'ios', bundleIdentifier: 'com.disney.disneyplus', category: 'Video', badgeCode: 'D+', color: '#113CCF' },
  { id: 'spotify', name: 'Spotify', platform: 'ios', bundleIdentifier: 'com.spotify.client', category: 'Video', badgeCode: 'SP', color: '#1DB954', urlScheme: 'spotify://' },

  // Messaging & Chat
  { id: 'whatsapp', name: 'WhatsApp', platform: 'ios', bundleIdentifier: 'net.whatsapp.WhatsApp', category: 'Chat', badgeCode: 'WA', color: '#16A34A', urlScheme: 'whatsapp://' },
  { id: 'telegram', name: 'Telegram', platform: 'ios', bundleIdentifier: 'ph.telegra.Telegraph', category: 'Chat', badgeCode: 'TG', color: '#24A1DE', urlScheme: 'tg://' },
  { id: 'discord', name: 'Discord', platform: 'ios', bundleIdentifier: 'com.hammerandchisel.discord', category: 'Chat', badgeCode: 'DC', color: '#5865F2', urlScheme: 'discord://' },
  { id: 'messenger', name: 'Messenger', platform: 'ios', bundleIdentifier: 'com.facebook.Messenger', category: 'Chat', badgeCode: 'MSG', color: '#00B2FF', urlScheme: 'fb-messenger://' },

  // Gaming
  { id: 'roblox', name: 'Roblox', platform: 'ios', bundleIdentifier: 'com.roblox.robloxmobile', category: 'Games', badgeCode: 'RBX', color: '#18181b' },
  { id: 'subway_surfers', name: 'Subway Surfers', platform: 'ios', bundleIdentifier: 'com.kiloo.subwaysurfers', category: 'Games', badgeCode: 'SUB', color: '#F59E0B' },
  { id: 'candy_crush', name: 'Candy Crush', platform: 'ios', bundleIdentifier: 'com.midasplayer.apps.candycrushsaga', category: 'Games', badgeCode: 'CC', color: '#EC4899' },
  { id: 'pubg', name: 'PUBG Mobile', platform: 'ios', bundleIdentifier: 'com.tencent.ig', category: 'Games', badgeCode: 'PUBG', color: '#D97706' },

  // Browsers & Web
  { id: 'chrome', name: 'Google Chrome', platform: 'ios', bundleIdentifier: 'com.google.chrome.ios', category: 'Web', badgeCode: 'CHR', color: '#4285F4', urlScheme: 'googlechrome://' },
  { id: 'safari', name: 'Safari', platform: 'ios', bundleIdentifier: 'com.apple.safari', category: 'Web', badgeCode: 'SF', color: '#007AFF' },
  { id: 'firefox', name: 'Firefox', platform: 'ios', bundleIdentifier: 'org.mozilla.ios.Fennec', category: 'Web', badgeCode: 'FF', color: '#FF7139', urlScheme: 'firefox://' },
  { id: 'brave', name: 'Brave Browser', platform: 'ios', bundleIdentifier: 'com.brave.ios.browser', category: 'Web', badgeCode: 'BRV', color: '#FB542B', urlScheme: 'brave://' },
];
