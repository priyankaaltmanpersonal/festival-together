import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function IndividualSchedulesScreen({ individualSnapshot, onLoadIndividual }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Individual Schedules</Text>
        <Pressable onPress={onLoadIndividual} style={styles.buttonPrimary}>
          <Text style={styles.buttonText}>Refresh Individual Schedules</Text>
        </Pressable>
      </View>

      {(individualSnapshot?.members || []).map((member) => (
        <View key={member.member_id} style={styles.card}>
          <Text style={styles.memberName}>{member.display_name}</Text>
          <Text style={styles.helper}>Setup: {member.setup_status}</Text>
          {(member.sets || []).slice(0, 12).map((setItem) => (
            <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
              <Text style={styles.setTitle}>{setItem.artist_name}</Text>
              <Text style={styles.helper}>
                {setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} PT • {setItem.preference}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8d8c1',
    padding: 12,
    gap: 8
  },
  label: { fontWeight: '700', color: '#303030' },
  memberName: { fontWeight: '700', fontSize: 16, color: '#2a2a2a' },
  helper: { color: '#666', fontSize: 12 },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  setRow: {
    borderWidth: 1,
    borderColor: '#e5d8c6',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fffdf9'
  },
  setTitle: { color: '#2f2f2f', fontWeight: '600' }
});
