import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function FounderToolsScreen({
  inviteCode,
  groupName,
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
  buttonSecondary: {
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  buttonText: { color: '#fff', fontWeight: '700' }
});
