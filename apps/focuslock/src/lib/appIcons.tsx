import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image, ImageSource } from 'expo-image';

/**
 * 26 High-resolution real app icons bundled directly with the application.
 * Guaranteed 100% offline reliability, instant rendering, and zero network latency.
 */
export const LOCAL_APP_ICONS: Record<string, any> = {
  instagram: require('../../assets/app-icons/instagram.png'),
  tiktok: require('../../assets/app-icons/tiktok.png'),
  x_twitter: require('../../assets/app-icons/x_twitter.png'),
  facebook: require('../../assets/app-icons/facebook.png'),
  snapchat: require('../../assets/app-icons/snapchat.png'),
  reddit: require('../../assets/app-icons/reddit.png'),
  threads: require('../../assets/app-icons/threads.png'),
  pinterest: require('../../assets/app-icons/pinterest.png'),
  linkedin: require('../../assets/app-icons/linkedin.png'),
  youtube: require('../../assets/app-icons/youtube.png'),
  netflix: require('../../assets/app-icons/netflix.png'),
  twitch: require('../../assets/app-icons/twitch.png'),
  disney_plus: require('../../assets/app-icons/disney_plus.png'),
  spotify: require('../../assets/app-icons/spotify.png'),
  whatsapp: require('../../assets/app-icons/whatsapp.png'),
  telegram: require('../../assets/app-icons/telegram.png'),
  discord: require('../../assets/app-icons/discord.png'),
  messenger: require('../../assets/app-icons/messenger.png'),
  roblox: require('../../assets/app-icons/roblox.png'),
  subway_surfers: require('../../assets/app-icons/subway_surfers.png'),
  candy_crush: require('../../assets/app-icons/candy_crush.png'),
  pubg: require('../../assets/app-icons/pubg.png'),
  chrome: require('../../assets/app-icons/chrome.png'),
  safari: require('../../assets/app-icons/safari.png'),
  firefox: require('../../assets/app-icons/firefox.png'),
  brave: require('../../assets/app-icons/brave.png'),
};

/**
 * Reverse mapping from bundle IDs to local icon keys
 */
const BUNDLE_ID_TO_ICON_KEY: Record<string, string> = {
  // Instagram
  'com.burbn.instagram': 'instagram',
  'com.instagram.android': 'instagram',
  'com.instagram.ios': 'instagram',
  'instagram': 'instagram',

  // TikTok
  'com.zhiliaoapp.musically': 'tiktok',
  'com.tiktok.android': 'tiktok',
  'com.ss.android.ugc.trill': 'tiktok',
  'tiktok': 'tiktok',

  // X / Twitter
  'com.atebits.Tweetie2': 'x_twitter',
  'com.twitter.android': 'x_twitter',
  'com.twitter.ios': 'x_twitter',
  'x_twitter': 'x_twitter',
  'twitter': 'x_twitter',

  // Facebook
  'com.facebook.Facebook': 'facebook',
  'com.facebook.katana': 'facebook',
  'facebook': 'facebook',

  // Snapchat
  'com.toyopagroup.picaboo': 'snapchat',
  'com.snapchat.android': 'snapchat',
  'com.snapchat.Snapchat': 'snapchat',
  'com.snap.snapchat': 'snapchat',
  'snapchat': 'snapchat',

  // Reddit
  'com.reddit.Reddit': 'reddit',
  'com.reddit.frontpage': 'reddit',
  'com.reddit.android': 'reddit',
  'reddit': 'reddit',

  // Threads
  'com.burbn.threads': 'threads',
  'com.instagram.barcelona': 'threads',
  'threads': 'threads',

  // Pinterest
  'pinterest': 'pinterest',
  'com.pinterest': 'pinterest',
  'com.pinterest.pinterest': 'pinterest',

  // LinkedIn
  'com.linkedin.LinkedIn': 'linkedin',
  'com.linkedin.android': 'linkedin',
  'linkedin': 'linkedin',

  // YouTube
  'com.google.ios.youtube': 'youtube',
  'com.google.android.youtube': 'youtube',
  'youtube': 'youtube',

  // Netflix
  'com.netflix.Netflix': 'netflix',
  'com.netflix.mediaclient': 'netflix',
  'netflix': 'netflix',

  // Twitch
  'tv.twitch': 'twitch',
  'tv.twitch.android.app': 'twitch',
  'twitch': 'twitch',

  // Disney+
  'com.disney.disneyplus': 'disney_plus',
  'disney_plus': 'disney_plus',
  'disney': 'disney_plus',

  // Spotify
  'com.spotify.client': 'spotify',
  'com.spotify.music': 'spotify',
  'spotify': 'spotify',

  // WhatsApp
  'net.whatsapp.WhatsApp': 'whatsapp',
  'com.whatsapp': 'whatsapp',
  'whatsapp': 'whatsapp',

  // Telegram
  'ph.telegra.Telegraph': 'telegram',
  'org.telegram.messenger': 'telegram',
  'telegram': 'telegram',

  // Discord
  'com.hammerandchisel.discord': 'discord',
  'com.discord': 'discord',
  'discord': 'discord',

  // Messenger
  'com.facebook.Messenger': 'messenger',
  'com.facebook.orca': 'messenger',
  'messenger': 'messenger',

  // Roblox
  'com.roblox.robloxmobile': 'roblox',
  'com.roblox.client': 'roblox',
  'roblox': 'roblox',

  // Subway Surfers
  'com.kiloo.subwaysurfers': 'subway_surfers',
  'com.kiloo.subwaysurf': 'subway_surfers',
  'subway_surfers': 'subway_surfers',

  // Candy Crush
  'com.midasplayer.apps.candycrushsaga': 'candy_crush',
  'com.king.candycrushsaga': 'candy_crush',
  'candy_crush': 'candy_crush',

  // PUBG
  'com.tencent.ig': 'pubg',
  'pubg': 'pubg',

  // Chrome
  'com.google.chrome.ios': 'chrome',
  'com.android.chrome': 'chrome',
  'chrome': 'chrome',

  // Safari
  'com.apple.mobilesafari': 'safari',
  'safari': 'safari',

  // Firefox
  'org.mozilla.ios.Fennec': 'firefox',
  'org.mozilla.firefox': 'firefox',
  'org.mozilla.ios.Firefox': 'firefox',
  'firefox': 'firefox',

  // Brave
  'com.brave.ios.browser': 'brave',
  'com.brave.browser': 'brave',
  'brave': 'brave',
};

/**
 * Returns the bundled local image asset for an app by bundleId, app name, or catalog ID.
 * Returns null if not matched.
 */
export function getLocalAppIcon(bundleId?: string, appName?: string, appId?: string): any | null {
  // 1. Direct appId match
  if (appId && LOCAL_APP_ICONS[appId]) {
    return LOCAL_APP_ICONS[appId];
  }

  // 2. Exact bundleId match
  if (bundleId) {
    const key = BUNDLE_ID_TO_ICON_KEY[bundleId];
    if (key && LOCAL_APP_ICONS[key]) {
      return LOCAL_APP_ICONS[key];
    }
  }

  // 3. Normalized string search across bundleId and appName
  const searchStr = `${bundleId || ''} ${appName || ''}`.toLowerCase();

  if (searchStr.includes('instagram')) return LOCAL_APP_ICONS.instagram;
  if (searchStr.includes('tiktok') || searchStr.includes('musically')) return LOCAL_APP_ICONS.tiktok;
  if (searchStr.includes('twitter') || searchStr.includes('tweetie') || (appName && appName.trim() === 'X') || searchStr.includes('x / twitter')) return LOCAL_APP_ICONS.x_twitter;
  if (searchStr.includes('facebook') || searchStr.includes('fb')) return LOCAL_APP_ICONS.facebook;
  if (searchStr.includes('snapchat')) return LOCAL_APP_ICONS.snapchat;
  if (searchStr.includes('reddit')) return LOCAL_APP_ICONS.reddit;
  if (searchStr.includes('threads')) return LOCAL_APP_ICONS.threads;
  if (searchStr.includes('pinterest')) return LOCAL_APP_ICONS.pinterest;
  if (searchStr.includes('linkedin')) return LOCAL_APP_ICONS.linkedin;
  if (searchStr.includes('youtube')) return LOCAL_APP_ICONS.youtube;
  if (searchStr.includes('netflix')) return LOCAL_APP_ICONS.netflix;
  if (searchStr.includes('twitch')) return LOCAL_APP_ICONS.twitch;
  if (searchStr.includes('disney')) return LOCAL_APP_ICONS.disney_plus;
  if (searchStr.includes('spotify')) return LOCAL_APP_ICONS.spotify;
  if (searchStr.includes('whatsapp')) return LOCAL_APP_ICONS.whatsapp;
  if (searchStr.includes('telegram')) return LOCAL_APP_ICONS.telegram;
  if (searchStr.includes('discord')) return LOCAL_APP_ICONS.discord;
  if (searchStr.includes('messenger')) return LOCAL_APP_ICONS.messenger;
  if (searchStr.includes('roblox')) return LOCAL_APP_ICONS.roblox;
  if (searchStr.includes('subway')) return LOCAL_APP_ICONS.subway_surfers;
  if (searchStr.includes('candy') && searchStr.includes('crush')) return LOCAL_APP_ICONS.candy_crush;
  if (searchStr.includes('pubg')) return LOCAL_APP_ICONS.pubg;
  if (searchStr.includes('chrome')) return LOCAL_APP_ICONS.chrome;
  if (searchStr.includes('safari')) return LOCAL_APP_ICONS.safari;
  if (searchStr.includes('firefox') || searchStr.includes('fennec')) return LOCAL_APP_ICONS.firefox;
  if (searchStr.includes('brave')) return LOCAL_APP_ICONS.brave;

  return null;
}

/** In-memory cache for online fallback lookups */
const remoteIconCache = new Map<string, string | null>();

/** Fetch with a safe timeout that works on all Hermes / React Native versions */
async function fetchWithTimeout(url: string, ms = 4000): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
  );
  return Promise.race([fetch(url), timeoutPromise]);
}

/** Resolve remote icon URL for unknown custom apps */
export async function resolveAppIcon(bundleId: string): Promise<string | null> {
  if (!bundleId) return null;

  // Check local first
  if (getLocalAppIcon(bundleId)) return null;

  if (remoteIconCache.has(bundleId)) {
    return remoteIconCache.get(bundleId)!;
  }

  try {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&limit=1`,
      3500
    );
    if (res.ok) {
      const data = await res.json();
      const icon = data?.results?.[0]?.artworkUrl100 || data?.results?.[0]?.artworkUrl512;
      if (icon) {
        remoteIconCache.set(bundleId, icon);
        return icon;
      }
    }
  } catch {
    // Network unavailable or timeout
  }

  remoteIconCache.set(bundleId, null);
  return null;
}

export function getCachedIcon(bundleId: string): string | null {
  if (!bundleId) return null;
  return remoteIconCache.get(bundleId) ?? null;
}

export interface AppIconProps {
  bundleId?: string;
  appName?: string;
  appId?: string;
  size?: number;
  borderRadius?: number;
  isLocked?: boolean;
  fallbackBadge?: string;
  fallbackColor?: string;
  style?: any;
  /**
   * Real installed-app icon URI (Android provider `file://` cache path).
   * When present it wins over bundled assets and remote lookups —
   * the actual icon of the app the user selected.
   */
  iconUri?: string;
}

/**
 * Universal App Icon Component
 * 0. Renders the real installed-app icon when the platform provider supplied one.
 * 1. Automatically renders bundled high-res icon if available (instant, offline).
 * 2. Attempts dynamic App Store artwork fetch for uncatalogued apps.
 * 3. Falls back to a clean branded monogram badge if unknown.
 */
export function AppIcon({
  bundleId = '',
  appName = '',
  appId,
  size = 40,
  borderRadius,
  isLocked = false,
  fallbackBadge,
  fallbackColor = '#15803D',
  style,
  iconUri,
}: AppIconProps) {
  const radius = borderRadius ?? Math.round(size * 0.22);
  const localSource = getLocalAppIcon(bundleId, appName, appId);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(() => getCachedIcon(bundleId));

  useEffect(() => {
    let active = true;
    if (!iconUri && !localSource && bundleId && !remoteUrl) {
      resolveAppIcon(bundleId).then((url) => {
        if (active && url) setRemoteUrl(url);
      });
    }
    return () => {
      active = false;
    };
  }, [bundleId, localSource, iconUri]);

  // 0. Real installed-app icon supplied by the platform provider
  if (iconUri) {
    return (
      <View
        style={[
          styles.iconContainer,
          { width: size, height: size, borderRadius: radius },
          isLocked && styles.lockedContainer,
          style,
        ]}
      >
        <Image
          source={{ uri: iconUri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
        />
        {isLocked && <View style={[styles.lockedOverlay, { borderRadius: radius }]} />}
      </View>
    );
  }

  // 1. Bundled Local Icon
  if (localSource) {
    return (
      <View
        style={[
          styles.iconContainer,
          { width: size, height: size, borderRadius: radius },
          isLocked && styles.lockedContainer,
          style,
        ]}
      >
        <Image
          source={localSource}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
        />
        {isLocked && <View style={[styles.lockedOverlay, { borderRadius: radius }]} />}
      </View>
    );
  }

  // 2. Dynamically Resolved Remote Icon
  if (remoteUrl) {
    return (
      <View
        style={[
          styles.iconContainer,
          { width: size, height: size, borderRadius: radius },
          isLocked && styles.lockedContainer,
          style,
        ]}
      >
        <Image
          source={{ uri: remoteUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
        />
        {isLocked && <View style={[styles.lockedOverlay, { borderRadius: radius }]} />}
      </View>
    );
  }

  // 3. Fallback Monogram
  const monogram =
    fallbackBadge ||
    (appName
      ? appName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase()
      : bundleId
      ? bundleId.split('.').pop()?.slice(0, 2).toUpperCase()
      : 'AP') ||
    'AP';

  return (
    <View
      style={[
        styles.iconContainer,
        styles.fallbackBadge,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: fallbackColor,
        },
        isLocked && styles.lockedContainer,
        style,
      ]}
    >
      <Text
        style={[
          styles.fallbackText,
          { fontSize: Math.max(10, Math.round(size * 0.36)) },
        ]}
      >
        {monogram}
      </Text>
      {isLocked && <View style={[styles.lockedOverlay, { borderRadius: radius }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedContainer: {
    opacity: 0.5,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  fallbackBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  fallbackText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
