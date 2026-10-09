import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { uploadAvatar } from '../../lib/storage';
import { deleteAccount } from '../../lib/api';
import { SubHeader, useSharedStyles } from './_shared';

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
  created_at: string;
}

function Field({
  label, value, placeholder, onChangeText, editable = true,
  autoCapitalize = 'none', keyboardType = 'default',
}: {
  label: string; value: string; placeholder?: string;
  onChangeText?: (v: string) => void; editable?: boolean;
  autoCapitalize?: any; keyboardType?: any;
}) {
  const { colors, isDark } = useSharedStyles();
  const styles = createAccountStyles(colors, isDark);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, !editable && styles.fieldDisabled]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.textMuted}
        editable={editable} autoCapitalize={autoCapitalize}
        keyboardType={keyboardType} selectionColor={colors.accent}
      />
    </View>
  );
}

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createAccountStyles(colors, isDark);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      const p: Profile = {
        id: user.id,
        username: data.username ?? '',
        display_name: data.display_name ?? '',
        avatar_url: data.avatar_url ?? null,
        email: user.email ?? '',
        created_at: data.created_at ?? '',
      };
      setProfile(p);
      setUsername(p.username);
      setDisplayName(p.display_name ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim(), display_name: displayName.trim() })
      .eq('id', profile.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Saved', 'Profile updated.');
      setProfile((p) => p ? { ...p, username: username.trim(), display_name: displayName.trim() } : p);
    }
    setSaving(false);
  };

  const handlePickAvatar = async () => {
    if (!profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const rawExt = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
      const ext = ['png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
      const mime = asset.mimeType || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg');
      const { url, error } = await uploadAvatar(profile.id, blob, ext, mime);
      if (error) throw error;
      setProfile((p) => p ? { ...p, avatar_url: url } : p);
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message ?? 'Could not upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Opens the inline confirmation modal
  const handleDeleteAccount = () => {
    setConfirmText('');
    setShowDeleteModal(true);
  };

  // Actual deletion — runs after user types DELETE and confirms
  const performDeleteAccount = async () => {
    if (!profile) return;
    setShowDeleteModal(false);
    setDeleting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        throw new Error('Your session has expired. Please log in again.');
      }

      // Call backend to permanently delete all data and auth.users via service role
      const res = await deleteAccount(accessToken);

      if (res.error) {
        throw new Error(res.error);
      }

      // Sign out client session cleanly
      await supabase.auth.signOut();
      setDeleting(false);

      Alert.alert(
        'Account Deleted',
        'Your account and all associated data have been permanently erased.',
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
    } catch (err: any) {
      Alert.alert('Deletion Failed', err?.message ?? 'Could not connect to the server to delete your account.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Account Settings" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#007aff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const avatarInitial = (profile?.display_name || profile?.username || 'U')[0].toUpperCase();
  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Account Settings" onBack={() => router.back()} />

      {/* ------------------------------------------------------------------ */}
      {/* DELETE CONFIRMATION MODAL                                            */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalIconRow}>
              <View style={styles.modalDangerIcon}>
                <Text style={styles.modalDangerIconText}>!</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>Delete Account Forever</Text>
            <Text style={styles.modalBody}>
              This will permanently erase your account, all app limits, devices, sessions, and every piece of data tied to your profile.{'\n\n'}This action is irreversible and cannot be undone.
            </Text>

            <Text style={styles.modalInputLabel}>
              Type{' '}
              <Text style={{ fontWeight: '800', color: '#ff3b30' }}>DELETE</Text>
              {' '}to confirm
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                confirmText.length > 0 && (canDelete ? styles.modalInputValid : styles.modalInputInvalid),
              ]}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="Type DELETE here"
              placeholderTextColor="#c7c7cc"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              selectionColor="#ff3b30"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalDeleteBtn, !canDelete && styles.modalDeleteBtnDisabled]}
                onPress={performDeleteAccount}
                disabled={!canDelete || deleting}
                activeOpacity={0.8}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalDeleteBtnText}>Delete Forever</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={sh.scroll}
          contentContainerStyle={sh.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile card */}
          <View style={styles.profileCard}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handlePickAvatar}
              activeOpacity={0.75}
              disabled={uploadingAvatar}
            >
              {profile?.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
                : <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitial}>{avatarInitial}</Text></View>
              }
              <View style={styles.avatarBadge}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.avatarBadgeText}>+</Text>
                }
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>
                {profile?.display_name || profile?.username || 'Your Name'}
              </Text>
              <Text style={styles.profileEmail}>{profile?.email}</Text>
              <View style={styles.memberBadge}>
                <Text style={styles.memberBadgeText}>Member since {memberSince}</Text>
              </View>
            </View>
          </View>

          {/* Edit fields */}
          <Text style={sh.sectionLabel}>PROFILE</Text>
          <View style={sh.card}>
            <Field
              label="Display Name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              autoCapitalize="words"
            />
            <View style={sh.divider} />
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="@username"
            />
            <View style={sh.divider} />
            <Field
              label="Email"
              value={profile?.email ?? ''}
              editable={false}
              keyboardType="email-address"
            />
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>
            }
          </TouchableOpacity>

          {/* About */}
          <Text style={sh.sectionLabel}>ABOUT</Text>
          <View style={sh.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutKey}>User ID</Text>
              <Text style={styles.aboutVal} numberOfLines={1}>{profile?.id.slice(0, 16)}…</Text>
            </View>
            <View style={sh.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutKey}>Member since</Text>
              <Text style={styles.aboutVal}>{memberSince}</Text>
            </View>
            <View style={sh.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutKey}>App version</Text>
              <Text style={styles.aboutVal}>1.1.5</Text>
            </View>
          </View>

          {/* Danger zone */}
          <Text style={sh.sectionLabel}>DANGER ZONE</Text>
          <View style={styles.dangerCard}>
            <Text style={styles.dangerTitle}>Permanently Delete Account</Text>
            <Text style={styles.dangerBody}>
              All your limits, sessions, and data will be permanently erased from our servers. This action cannot be undone.
            </Text>
            <TouchableOpacity
              style={[styles.deleteBtn, deleting && { opacity: 0.6 }]}
              onPress={handleDeleteAccount}
              activeOpacity={0.8}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator color="#ff3b30" size="small" />
                : <Text style={styles.deleteBtnText}>Delete My Account</Text>
              }
            </TouchableOpacity>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createAccountStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: isDark ? colors.bgCardSolid : '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 68, height: 68, borderRadius: 34, overflow: 'hidden' },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: { color: '#fff', fontSize: 26, fontWeight: '700' },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  avatarBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  profileName: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  profileEmail: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginTop: 2 },
  memberBadge: {
    alignSelf: 'flex-start',
    backgroundColor: isDark ? colors.bgInput : '#f2f2f7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  memberBadgeText: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  fieldWrap: { paddingVertical: 12, paddingHorizontal: 16 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  fieldInput: { color: colors.textPrimary, fontSize: 16, fontWeight: '500', paddingVertical: 0 },
  fieldDisabled: { color: colors.textMuted },
  saveBtn: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  aboutKey: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  aboutVal: { color: colors.textSecondary, fontSize: 15, fontWeight: '500', maxWidth: '55%', textAlign: 'right' },
  dangerCard: {
    backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fff5f5',
    borderRadius: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#fecaca',
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  dangerTitle: { color: '#ff3b30', fontSize: 15, fontWeight: '700' },
  dangerBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  deleteBtn: {
    backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#fecaca',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteBtnText: { color: '#ff3b30', fontSize: 14, fontWeight: '600' },

  // ─── Delete Confirmation Modal ─────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: isDark ? colors.bgModal : '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  modalIconRow: { alignItems: 'center', marginBottom: 16 },
  modalDangerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef2f2',
    borderWidth: 2,
    borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerIconText: { color: '#ff3b30', fontSize: 26, fontWeight: '800' },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  modalBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInputLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    letterSpacing: 2,
    backgroundColor: isDark ? colors.bgInput : '#ffffff',
  },
  modalInputValid: { borderColor: '#34c759', backgroundColor: isDark ? '#14301d' : '#f0fdf4' },
  modalInputInvalid: { borderColor: '#fecaca', backgroundColor: isDark ? '#301414' : '#fff5f5' },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: isDark ? colors.bgInput : '#f2f2f7',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  modalDeleteBtn: {
    flex: 1,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalDeleteBtnDisabled: { backgroundColor: '#fecaca' },
  modalDeleteBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  });
}
