import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme';

export function MoreSheet({
  visible,
  onClose,
  inviteCode,
  inviteCopied,
  onCopyInvite,
  onIndividualSchedules,
  isFounder,
  onFounderTools,
  onResetApp,
  onDeleteMyData,
  currentDisplayName,
  currentChipColor,
  chipColorOptions,
  takenColors,
  onSaveProfile,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const openProfile = () => {
    setDraftName(currentDisplayName || '');
    setDraftColor(currentChipColor || '');
    setSaveError('');
    setProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!draftName.trim()) {
      setSaveError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await onSaveProfile(draftName.trim(), draftColor);
      setProfileOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset App?',
      'This will clear your session and return to the welcome screen. Your group and schedule data will remain on the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: onResetApp },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>

            {inviteCode ? (
              <Pressable onPress={onCopyInvite} style={styles.inviteCard}>
                <Text style={styles.inviteLabel}>Invite friends</Text>
                <View style={styles.inviteRow}>
                  <Text style={styles.inviteCode}>{inviteCode}</Text>
                  <Text style={styles.inviteCopy}>{inviteCopied ? '✓ Copied!' : '📋 Copy'}</Text>
                </View>
              </Pressable>
            ) : null}

            <Pressable onPress={profileOpen ? null : openProfile} style={styles.row}>
              <Text style={styles.rowLabel}>Edit Profile</Text>
              {!profileOpen ? <Text style={styles.rowChevron}>›</Text> : null}
            </Pressable>
            {profileOpen ? (
              <View style={styles.profileForm}>
                <Text style={styles.fieldLabel}>Display name</Text>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  style={styles.input}
                  maxLength={60}
                  placeholder="Your name"
                />
                <Text style={styles.fieldLabel}>Chip color</Text>
                <View style={styles.colorGrid}>
                  {(chipColorOptions || []).map((color) => {
                    const taken = (takenColors || []).includes(color) && color !== currentChipColor;
                    return (
                      <Pressable
                        key={color}
                        disabled={taken}
                        onPress={() => setDraftColor(color)}
                        style={[
                          styles.swatch,
                          { backgroundColor: color },
                          draftColor === color && styles.swatchSelected,
                          taken && styles.swatchTaken,
                        ]}
                      />
                    );
                  })}
                </View>
                {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
                <View style={styles.profileBtns}>
                  {saving ? (
                    <ActivityIndicator color={C.primary} />
                  ) : (
                    <Pressable onPress={handleSaveProfile} style={styles.saveBtn}>
                      <Text style={styles.saveBtnText}>Save</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setProfileOpen(false)} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Pressable onPress={() => { onClose(); onIndividualSchedules(); }} style={styles.row}>
              <Text style={styles.rowLabel}>Individual Schedules</Text>
              <Text style={styles.rowChevron}>›</Text>
            </Pressable>

            {isFounder && onFounderTools ? (
              <Pressable onPress={onFounderTools} style={styles.row}>
                <Text style={styles.rowLabel}>Founder Tools</Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={handleResetApp} style={styles.resetRow}>
              <Text style={styles.resetLabel}>Reset App</Text>
            </Pressable>

            {onDeleteMyData ? (
              <Pressable onPress={onDeleteMyData} style={styles.resetRow}>
                <Text style={styles.deleteLabel}>Delete My Data</Text>
              </Pressable>
            ) : null}

          </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.modalOverlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: C.tabBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  inviteCard: {
    backgroundColor: C.primaryBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.inputBorder,
    padding: 12,
    marginBottom: 8,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCode: { fontSize: 16, fontWeight: '700', color: C.kickerText, letterSpacing: 1 },
  inviteCopy: { fontSize: 12, fontWeight: '700', color: C.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  rowLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  rowChevron: { fontSize: 20, color: C.textMuted },
  profileForm: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.fieldLabelText },
  input: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: C.inputBg,
    color: C.text,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: C.text,
    transform: [{ scale: 1.15 }],
  },
  swatchTaken: { opacity: 0.2 },
  saveError: { fontSize: 11, color: C.error, fontWeight: '700' },
  profileBtns: { flexDirection: 'row', gap: 8 },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  saveBtnText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  resetRow: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  resetLabel: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '400',
  },
  deleteLabel: {
    fontSize: 12,
    color: C.error,
    fontWeight: '400',
  },
});
