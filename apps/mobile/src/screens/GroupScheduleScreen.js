import { useState } from 'react';
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
  const [showLegend, setShowLegend] = useState(false);

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
        <Pressable onPress={() => setShowLegend((prev) => !prev)} style={styles.infoButton}>
          <Text style={styles.infoButtonText}>{showLegend ? 'Hide Legend' : 'Show Legend'}</Text>
        </Pressable>
        {showLegend ? (
          <View style={styles.legendBox}>
            <Text style={styles.helper}>Avatar opacity: full = must-see, faded = flexible.</Text>
            <Text style={styles.helper}>No avatar = not going or setup incomplete.</Text>
            <Text style={styles.helper}>Popularity colors: gray low, yellow medium, green high.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Schedule Grid Data</Text>
        <Text style={styles.helper}>Total sets: {scheduleSnapshot?.sets?.length || 0}</Text>
        <ScrollView horizontal>
          <View>
            <View style={styles.gridHeader}>
              <Text style={[styles.gridCell, styles.gridTime, styles.gridHeaderText]}>Time</Text>
              {(scheduleSnapshot?.stages || []).map((stage) => (
                <Text key={stage} style={[styles.gridCell, styles.gridStage, styles.gridHeaderText]}>
                  {stage}
                </Text>
              ))}
            </View>
            {(scheduleSnapshot?.time_rows || []).map((row) => (
              <View key={`${row.day_index}-${row.time_pt}`} style={styles.gridRow}>
                <Text style={[styles.gridCell, styles.gridTime]}>{row.time_pt}</Text>
                {(scheduleSnapshot?.stages || []).map((stage) => {
                  const items = row.cells?.[stage] || [];
                  return (
                    <View key={`${row.day_index}-${row.time_pt}-${stage}`} style={[styles.gridCell, styles.gridStage]}>
                      {items.length === 0 ? <Text style={styles.helper}>-</Text> : null}
                      {items.slice(0, 2).map((setItem) => (
                        <View key={setItem.id} style={[styles.setCard, tierStyle(setItem.popularity_tier)]}>
                          <Text style={styles.title}>{setItem.artist_name}</Text>
                          <Text style={styles.helper}>
                            {setItem.attendee_count} going • {setItem.must_see_count} must-see
                          </Text>
                          <View style={styles.avatarRow}>
                            {(setItem.attendees || []).slice(0, 6).map((attendee) => (
                              <View
                                key={attendee.member_id}
                                style={[
                                  styles.avatarBubble,
                                  attendee.preference === 'must_see' ? styles.avatarMustSee : styles.avatarFlexible
                                ]}
                              >
                                <Text style={styles.avatarText}>{initials(attendee.display_name)}</Text>
                              </View>
                            ))}
                            {setItem.attendee_count > 6 ? (
                              <Text style={styles.helper}>+{setItem.attendee_count - 6}</Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
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
  infoButton: {
    borderWidth: 1,
    borderColor: '#a78f71',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f9f2e6'
  },
  infoButtonText: {
    color: '#4d3b2a',
    fontWeight: '700'
  },
  legendBox: {
    borderWidth: 1,
    borderColor: '#dfd0bb',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#fffaf2',
    gap: 4
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
  title: { fontWeight: '700', color: '#2f2f2f', fontSize: 12 },
  gridHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#d8c8b2'
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#eee0cd'
  },
  gridCell: {
    padding: 8,
    borderRightWidth: 1,
    borderColor: '#eee0cd'
  },
  gridTime: {
    width: 72
  },
  gridStage: {
    width: 170
  },
  gridHeaderText: {
    fontWeight: '700',
    color: '#2d2d2d'
  },
  avatarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6
  },
  avatarBubble: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  avatarMustSee: {
    backgroundColor: '#1f7a42',
    borderColor: '#185c31',
    opacity: 1
  },
  avatarFlexible: {
    backgroundColor: '#2f6f4a',
    borderColor: '#1f5135',
    opacity: 0.45
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  }
});

function tierStyle(tier) {
  if (tier === 'high') {
    return { borderColor: '#1f7a42', backgroundColor: '#e6f6eb' };
  }
  if (tier === 'medium') {
    return { borderColor: '#7a6d1f', backgroundColor: '#faf7e8' };
  }
  if (tier === 'low') {
    return { borderColor: '#6a6a6a', backgroundColor: '#f7f7f7' };
  }
  return { borderColor: '#dfd0bb', backgroundColor: '#fffcf7' };
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  return `${first}${second}`.toUpperCase();
}
