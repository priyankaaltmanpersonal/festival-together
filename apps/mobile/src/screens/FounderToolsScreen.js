import { useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  onImportFromPreset,
  availablePresets = [],
  onCopyInvite,
  inviteCopied,
  onDeleteLineup,
  lineupImportState = 'idle',
  lineupImportResult = null,
  officialLineupStats = null,
  festivalDays = [],
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const missingDays = useMemo(() => {
    if (!lineupImportResult?.days_processed) return [];
    return (festivalDays || [])
      .map((d) => d.label)
      .filter((label) => !lineupImportResult.days_processed.includes(label));
  }, [festivalDays, lineupImportResult]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Founder Controls</Text>
        <Text style={styles.helper}>Group: {groupName || 'n/a'}</Text>
        <Pressable
          testID="invite-copy-row"
          onPress={onCopyInvite}
          style={styles.inviteRow}
        >
          <Text style={styles.helper}>
            Invite code: <Text style={styles.inviteCodeText}>{inviteCode || 'n/a'}</Text>
          </Text>
          <Text style={styles.copyHint}>{inviteCopied ? '✓ Copied!' : '📋 Copy'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Official Lineup</Text>
        <Text style={styles.helper}>
          Upload the 3 official day graphics to seed the full schedule for your group.
          Members can then browse and tap artists directly without uploading screenshots.
        </Text>

        {lineupImportState === 'uploading' ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={[styles.helper, { flex: 1 }]}>Parsing lineup… this may take 1–2 minutes. Please keep the app open.</Text>
          </View>
        ) : lineupImportState === 'done' && lineupImportResult ? (
          <>
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                ✓ {lineupImportResult.sets_created} sets imported
                {lineupImportResult.days_processed?.length
                  ? ` across ${lineupImportResult.days_processed.join(', ')}`
                  : ''}
              </Text>
            </View>
            {missingDays.length > 0 ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  Couldn't read: {missingDays.join(', ')}. Re-upload just those images to add the missing days.
                </Text>
              </View>
            ) : null}
          </>
        ) : lineupImportState === 'idle' && officialLineupStats?.set_count > 0 ? (
          <View style={styles.statsBox}>
            <Text style={styles.statsText}>
              ✓ Official lineup already imported — {officialLineupStats.set_count} sets
              {officialLineupStats.days?.length ? ` across ${officialLineupStats.days.join(', ')}` : ''}
            </Text>
          </View>
        ) : null}

        {availablePresets.length > 0 && lineupImportState !== 'done' ? (
          availablePresets.map((preset) => {
            const alreadyImported = officialLineupStats?.set_count > 0;
            const isDisabled = lineupImportState === 'uploading' || alreadyImported;
            return (
              <Pressable
                key={preset.id}
                onPress={() => onImportFromPreset(preset.id)}
                disabled={isDisabled}
                style={[styles.buttonPrimary, isDisabled && styles.buttonDisabled]}
              >
                <Text style={styles.buttonPrimaryText}>{preset.label}</Text>
              </Pressable>
            );
          })
        ) : null}
        <Pressable
          onPress={onImportLineup}
          disabled={lineupImportState === 'uploading'}
          style={[
            availablePresets.length > 0 && lineupImportState !== 'done' ? styles.buttonSecondary : styles.buttonPrimary,
            lineupImportState === 'uploading' && styles.buttonDisabled,
          ]}
        >
          <Text style={availablePresets.length > 0 && lineupImportState !== 'done' ? styles.buttonSecondaryText : styles.buttonPrimaryText}>
            {lineupImportState === 'done'
              ? 'Re-upload to Add Missing Sets'
              : availablePresets.length > 0
              ? 'Upload a different festival\'s schedule'
              : 'Upload Official Lineup'}
          </Text>
        </Pressable>

        {(lineupImportState === 'done' || (officialLineupStats?.set_count > 0)) && onDeleteLineup ? (
          <Pressable
            onPress={() => {
              Alert.alert(
                'Delete All Official Sets',
                "This will delete all imported sets and everyone's selections of them. Are you sure?",
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDeleteLineup },
                ],
              );
            }}
            style={styles.buttonDestructive}
          >
            <Text style={styles.buttonDestructiveText}>Delete All Official Sets</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20, paddingTop: 12 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8,
  },
  label: { fontWeight: '700', color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inviteCodeText: { fontWeight: '700', letterSpacing: 1 },
  copyHint: { fontSize: 12, fontWeight: '700', color: C.primary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successBox: {
    backgroundColor: C.successBg || '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.successBorder || '#86efac',
  },
  successText: { color: C.success || '#16a34a', fontWeight: '700', fontSize: 13 },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  warningText: { color: '#92400e', fontWeight: '700', fontSize: 13 },
  statsBox: {
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
  },
  statsText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonPrimaryText: { color: '#fff', fontWeight: '700' },
  buttonSecondary: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
  },
  buttonSecondaryText: { color: C.text, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  buttonDestructive: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  buttonDestructiveText: { color: '#dc2626', fontWeight: '700' },
});
