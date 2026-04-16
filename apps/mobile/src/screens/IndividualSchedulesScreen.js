import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DaySelector } from '../components/DaySelector';
import { useTheme } from '../theme';
import { formatTimeStr } from '../utils';

function PreferenceBadge({ preference, styles }) {
  const isDefinitely = preference === 'must_see';
  const label = isDefinitely ? 'Definitely' : 'Maybe';
  const bgColor = isDefinitely ? 'rgba(22,163,74,0.15)' : 'rgba(245,158,11,0.15)';
  const textColor = isDefinitely ? '#16a34a' : '#B45309';
  return (
    <View
      testID="preference-badge"
      style={[styles.badgePill, { backgroundColor: bgColor }]}
    >
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function IndividualSchedulesScreen({ individualSnapshot, festivalDays, onLoadIndividual, onBack }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const members = individualSnapshot?.members || [];

  const availableDays = festivalDays || [];
  const [selectedDay, setSelectedDay] = useState(availableDays[0]?.dayIndex ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState(new Set());

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.display_name?.toLowerCase().includes(q));
  }, [members, searchQuery]);

  const toggleCollapse = (memberId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

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
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name…"
          placeholderTextColor={C.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
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

      {filteredMembers.map((member) => {
        const isCollapsed = collapsedIds.has(member.member_id);
        const daySets = selectedDay !== null
          ? (member.sets || []).filter((s) => s.day_index === selectedDay)
          : (member.sets || []);
        const dayLabel = availableDays.find((d) => d.dayIndex === selectedDay)?.label || '';
        const chipColor = member.chip_color || C.primary;
        return (
          <View key={member.member_id} style={styles.card}>
            <Pressable onPress={() => toggleCollapse(member.member_id)} style={styles.memberHeader}>
              <View style={[styles.memberColorDot, { backgroundColor: chipColor }]} />
              <Text style={styles.memberName}>{member.display_name}</Text>
              <Text style={styles.collapseIcon}>{isCollapsed ? '›' : '⌄'}</Text>
            </Pressable>
            {!isCollapsed ? (
              daySets.length ? (
                daySets.map((setItem) => (
                  <View key={`${member.member_id}-${setItem.canonical_set_id}`} style={styles.setRow}>
                    <Text style={styles.setTitle}>{setItem.artist_name}</Text>
                    <Text style={styles.helper}>
                      {setItem.stage_name} • {formatTimeStr(setItem.start_time_pt)}–{formatTimeStr(setItem.end_time_pt)}
                    </Text>
                    <PreferenceBadge preference={setItem.preference} styles={styles} />
                  </View>
                ))
              ) : (
                <Text style={styles.helper}>
                  {(member.sets || []).length > 0
                    ? `No sets on ${dayLabel}.`
                    : 'No mapped sets yet for this member.'}
                </Text>
              )
            ) : null}
          </View>
        );
      })}
      {searchQuery && filteredMembers.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.helper}>No members match "{searchQuery}".</Text>
        </View>
      ) : null}
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
  searchInput: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: C.inputBg,
    color: C.text,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberColorDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
  },
  memberName: { fontWeight: '700', fontSize: 16, color: C.text, flex: 1 },
  collapseIcon: { fontSize: 18, color: C.textMuted },
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
  setTitle: { color: C.setRowTitle, fontWeight: '700' },
  badgePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
