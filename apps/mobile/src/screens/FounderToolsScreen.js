import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function FounderToolsScreen({
  inviteCode,
  groupName,
  loading,
  onRerunCanonical,
  onOpenSchedule
}) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Founder Controls</Text>
        <Text style={styles.helper}>Group: {groupName || 'n/a'}</Text>
        <Text style={styles.helper}>Invite code: {inviteCode || 'n/a'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Canonical Schedule</Text>
        <Text style={styles.helper}>Re-import and reconfirm your group-level master schedule.</Text>
        <Pressable onPress={onRerunCanonical} style={[styles.buttonPrimary, loading && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>Re-Run Canonical Parse</Text>
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

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8d8c1',
    padding: 12,
    gap: 8
  },
  label: { fontWeight: '700', color: '#303030' },
  helper: { color: '#666', fontSize: 12 },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  buttonSecondary: {
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 }
});
