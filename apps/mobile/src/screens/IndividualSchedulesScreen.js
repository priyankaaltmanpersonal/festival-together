import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DaySelector } from '../components/DaySelector';
import { useTheme } from '../theme';
import { formatTimeStr } from '../utils';

export function IndividualSchedulesScreen({ individualSnapshot, festivalDays, onLoadIndividual, onBack }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const members = individualSnapshot?.members || [];

  const availableDays = festivalDays || [];
  const [selectedDay, setSelectedDay] = useState(availableDays[0]?.dayIndex ?? null);

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
        {availableDays.length > 1 ? (
          <DaySelector
            days={availableDays}
            selectedDay={selectedDay}
            onSelect={setSelectedDay}
          />
        ) : null}
        <Pressable onPress={onLoadIndividual} style={styles.buttonSecondary}>
          <Text style={styles.buttonText}>Refresh Individual Schedules</Text>
        </Pressable>
        {!members.length ? <Text style={styles.helper}>No data yet. Run member setup and refresh.</Text> : null}
      </View>

      {members.map((member) => {
        const daySets = selectedDay !== null
          ? (member.sets || []).filter((s) => s.day_index === selectedDay)
          : (member.sets || []);
        const dayLabel = availableDays.find((d) => d.dayIndex === selectedDay)?.label || '';
        return (
          <View key={member.member_id} style={styles.card}>
            <Text style={styles.memberName}>{member.display_name}</Text>
            <Text style={styles.helper}>Setup: {member.setup_status}</Text>
            {daySets.length ? (
              daySets.map((setItem) => (
                <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
                  <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                  <Text style={styles.helper}>
                    {setItem.stage_name} • {formatTimeStr(setItem.start_time_pt)}–{formatTimeStr(setItem.end_time_pt)} • {setItem.preference === 'must_see' ? 'Definitely' : 'Maybe'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.helper}>
                {(member.sets || []).length > 0
                  ? `No sets on ${dayLabel}.`
                  : 'No mapped sets yet for this member.'}
              </Text>
            )}
          </View>
        );
      })}
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
