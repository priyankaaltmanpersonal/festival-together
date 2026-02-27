import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function GroupScheduleScreen({
  homeSnapshot,
  scheduleSnapshot,
  mustSeeOnly,
  selectedMemberId,
  onToggleMustSee,
  onToggleMember,
  onLoadSchedule
}) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Filters</Text>
        <Pressable onPress={onToggleMustSee} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>{mustSeeOnly ? 'Must-Sees Only: ON' : 'Must-Sees Only: OFF'}</Text>
        </Pressable>
        <Text style={styles.helper}>People filter (OR)</Text>
        <View style={styles.rowWrap}>
          {(homeSnapshot?.members || []).map((member) => (
            <Pressable
              key={member.id}
              onPress={() => onToggleMember(member.id)}
              style={[styles.pill, selectedMemberId === member.id && styles.pillSelected]}
            >
              <Text style={[styles.pillText, selectedMemberId === member.id && styles.pillTextSelected]}>
                {member.display_name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onLoadSchedule} style={styles.buttonPrimary}>
          <Text style={styles.buttonText}>Refresh Group Schedule</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Schedule Grid Data</Text>
        <Text style={styles.helper}>Total sets: {scheduleSnapshot?.sets?.length || 0}</Text>
        {(scheduleSnapshot?.sets || []).slice(0, 20).map((setItem) => (
          <View key={setItem.id} style={styles.setCard}>
            <Text style={styles.title}>{setItem.artist_name}</Text>
            <Text style={styles.helper}>{setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} PT</Text>
            <Text style={styles.helper}>Attendees {setItem.attendee_count} • Must-sees {setItem.must_see_count}</Text>
          </View>
        ))}
      </View>
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
  helper: { color: '#666', fontSize: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: '#cab697',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fbf6ee'
  },
  pillSelected: { backgroundColor: '#e4f2e7', borderColor: '#6a9e73' },
  pillText: { color: '#4a4a4a', fontSize: 12 },
  pillTextSelected: { color: '#235232' },
  buttonPrimary: {
    backgroundColor: '#183a27',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonSecondary: {
    backgroundColor: '#345a46',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  setCard: {
    borderWidth: 1,
    borderColor: '#dfd0bb',
    borderRadius: 10,
    padding: 8,
    marginTop: 6,
    backgroundColor: '#fffcf7'
  },
  title: { fontWeight: '700', color: '#2f2f2f' }
});
