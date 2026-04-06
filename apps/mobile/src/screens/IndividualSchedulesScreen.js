import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

export function IndividualSchedulesScreen({ individualSnapshot, onLoadIndividual, onBack }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const members = individualSnapshot?.members || [];

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </Pressable>
          ) : null}
          <Text style={styles.label}>Individual Schedules</Text>
        </View>
        <Pressable onPress={onLoadIndividual} style={styles.buttonSecondary}>
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
  wrap: { gap: 10, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 22 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8
  },
  headerRow: { gap: 4 },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { color: C.primary, fontWeight: '700', fontSize: 13 },
  label: { fontWeight: '700', color: C.text },
  memberName: { fontWeight: '700', fontSize: 16, color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  buttonSecondary: {
    backgroundColor: C.btnSecondaryBg,
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonText: { color: C.btnSecondaryText, fontWeight: '700' },
  setRow: {
    borderWidth: 1,
    borderColor: C.setRowBorder,
    borderRadius: 10,
    padding: 8,
    backgroundColor: C.setRowBg
  },
  setTitle: { color: C.setRowTitle, fontWeight: '600' }
});
