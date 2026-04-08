import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  lineupImportState = 'idle',
  lineupImportResult = null,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Founder Controls</Text>
        <Text style={styles.helper}>Group: {groupName || 'n/a'}</Text>
        <Text style={styles.helper}>Invite code: {inviteCode || 'n/a'}</Text>
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
            <Text style={styles.helper}>Parsing lineup… this may take 15–30 seconds.</Text>
          </View>
        ) : lineupImportState === 'done' && lineupImportResult ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              ✓ {lineupImportResult.sets_created} sets imported
              {lineupImportResult.days_processed?.length
                ? ` across ${lineupImportResult.days_processed.join(', ')}`
                : ''}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onImportLineup}
          disabled={lineupImportState === 'uploading'}
          style={[styles.buttonPrimary, lineupImportState === 'uploading' && styles.buttonDisabled]}
        >
          <Text style={styles.buttonPrimaryText}>
            {lineupImportState === 'done' ? 'Re-upload to Add Missing Sets' : 'Upload Official Lineup'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Back to Group View</Text>
        <Pressable onPress={onOpenSchedule} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>Open Group Schedule</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successBox: {
    backgroundColor: C.successBg || '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.successBorder || '#86efac',
  },
  successText: { color: C.success || '#16a34a', fontWeight: '700', fontSize: 13 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonPrimaryText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
