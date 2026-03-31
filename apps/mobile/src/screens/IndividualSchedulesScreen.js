import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function IndividualSchedulesScreen({ individualSnapshot, onLoadIndividual }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const members = individualSnapshot?.members || [];

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Individual Schedules</Text>
        <Pressable onPress={onLoadIndividual} style={styles.buttonPrimary}>
          <Text style={styles.buttonText}>Refresh Individual Schedules</Text>
        </Pressable>
        {!members.length ? <Text style={styles.helper}>No data yet. Run member setup and refresh.</Text> : null}
      </View>

      {members.map((member) => (
        <View key={member.member_id} style={styles.card}>
          <Text style={styles.memberName}>{member.display_name}</Text>
          <Text style={styles.helper}>Setup: {member.setup_status}</Text>
          {(member.sets || []).length ? (
            (member.sets || []).slice(0, 12).map((setItem) => (
              <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
                <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                <Text style={styles.helper}>
                  {setItem.stage_name} • {setItem.start_time_pt}-{setItem.end_time_pt} PT • {setItem.preference}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.helper}>No mapped sets yet for this member.</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 22 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8
  },
  label: { fontWeight: '700', color: C.text },
  memberName: { fontWeight: '700', fontSize: 16, color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  setRow: {
    borderWidth: 1,
    borderColor: C.setRowBorder,
    borderRadius: 10,
    padding: 8,
    backgroundColor: C.setRowBg
  },
  setTitle: { color: C.setRowTitle, fontWeight: '600' }
});
