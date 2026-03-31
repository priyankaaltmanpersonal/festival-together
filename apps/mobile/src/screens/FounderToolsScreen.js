import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule
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
    gap: 8
  },
  label: { fontWeight: '700', color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  buttonSecondary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  buttonText: { color: '#fff', fontWeight: '700' }
});
