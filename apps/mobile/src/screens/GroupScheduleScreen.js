import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { DaySelector } from '../components/DaySelector';
import { timeToMinutes, formatTime, minuteToY, buildTimeline, initials, withAlpha, SLOT_MINUTES, SLOT_HEIGHT } from '../utils';

const GRID_HEADER_HEIGHT = 33; // header row height (padding 6+6 + font ~12 + border 1)
const BUBBLES_PER_ROW = 6;

export function GroupScheduleScreen({
  homeSnapshot,
  scheduleSnapshot,
  selectedMemberIds,
  loading,
  onToggleMember,
  onResetFilters,
  inviteCode,
  onCopyInvite,
  inviteCopied,
  myMemberId,
  onAddToMySchedule,
  festivalDays,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [expandedSet, setExpandedSet] = useState(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [filterHeight, setFilterHeight] = useState(0);
  const gridBodyHeight = containerHeight > 0
    ? Math.max(0, containerHeight - filterHeight - GRID_HEADER_HEIGHT)
    : null;
  const members = homeSnapshot?.members || [];
  const hasActiveFilters = (selectedMemberIds || []).length > 0;
  const sets = scheduleSnapshot?.sets || [];
  const stages = scheduleSnapshot?.stages || [];

  // Sorted unique day indices that have sets
  const availableDays = useMemo(
    () => [...new Set(sets.map((s) => s.day_index).filter((d) => d != null))].sort((a, b) => a - b),
    [sets]
  );

  const [selectedDay, setSelectedDay] = useState(null);

  // Default to first available day; stay on selected if it's still valid
  const effectiveDay = selectedDay !== null && availableDays.includes(selectedDay)
    ? selectedDay
    : (availableDays[0] ?? null);

  const filteredSets = effectiveDay !== null
    ? sets.filter((s) => s.day_index === effectiveDay)
    : sets;

  const stageColumns = stages
    .map((stage) => ({
      stage,
      sets: filteredSets
        .filter((item) => item.stage_name === stage)
        .sort((a, b) => timeToMinutes(a.start_time_pt) - timeToMinutes(b.start_time_pt)),
    }));

  const timeline = buildTimeline(filteredSets, gridBodyHeight || 0);
  const memberColorById = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.chip_color])),
    [members]
  );
  const timeScrollRef = useRef(null);

  return (
    <View style={styles.wrap} onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}>
      <View style={styles.filterSection} onLayout={(e) => setFilterHeight(e.nativeEvent.layout.height)}>
        <View style={styles.filterBar}>
          <View style={styles.topRow}>
            {hasActiveFilters ? (
              <Pressable onPress={onResetFilters} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>Clear Filters</Text>
              </Pressable>
            ) : null}
            {inviteCode ? (
              <Pressable onPress={onCopyInvite} style={styles.inviteRow}>
                <Text style={styles.inviteText}>Invite Your Friends to Join: <Text style={styles.inviteCode}>{inviteCode}</Text></Text>
                <Text style={styles.inviteCopyIcon}>{inviteCopied ? '✓' : '📋'}</Text>
              </Pressable>
            ) : null}
          </View>
          {availableDays.length > 1 ? (
            <DaySelector
              days={availableDays.map((dayIdx) => ({
                dayIndex: dayIdx,
                label: (festivalDays || []).find((d) => d.dayIndex === dayIdx)?.label || `Day ${dayIdx}`,
              }))}
              selectedDay={effectiveDay}
              onSelect={setSelectedDay}
            />
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>
            {members.map((member) => {
              const selected = (selectedMemberIds || []).includes(member.id);
              const memberColor = member.chip_color || '#5c5c5c';
              return (
                <Pressable
                  key={member.id}
                  onPress={() => onToggleMember(member.id)}
                  disabled={loading}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, { color: memberColor }]}>
                    {member.display_name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {!timeline ? <Text style={styles.helperPad}>No schedule loaded yet.</Text> : null}

      {timeline ? (
        <View style={styles.gridOuter}>
          {/* Fixed left: time header + time body */}
          <View style={styles.timePanel}>
            <View style={styles.timePanelHeader} />
            <ScrollView
              ref={timeScrollRef}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              style={gridBodyHeight ? { height: gridBodyHeight } : styles.gridVScroll}
            >
              <View style={[styles.timeCol, { height: timeline.totalHeight }]}>
                {timeline.labels.map((minute) => {
                  const y = minuteToY(minute, timeline.startMinute);
                  return (
                    <View key={`time-${minute}`} style={[styles.timeTick, { top: y }]}>
                      <Text style={styles.timeText}>{formatTime(minute)}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* Scrollable right: stage headers + stage bodies */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stagesHScroll}>
            <View>
              <View style={styles.gridHeader}>
                {stageColumns.map((column) => (
                  <Text key={column.stage} style={[styles.headerCell, styles.stageCol, styles.headerText]}>
                    {column.stage}
                  </Text>
                ))}
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={gridBodyHeight ? { height: gridBodyHeight } : styles.gridVScroll}
                onScroll={(e) => {
                  timeScrollRef.current?.scrollTo({
                    y: e.nativeEvent.contentOffset.y,
                    animated: false,
                  });
                }}
                scrollEventThrottle={16}
              >
                <View style={styles.gridBody}>
                  {stageColumns.map((column) => (
                    <View key={column.stage} style={[styles.stageCol, { height: timeline.totalHeight }]}>
                      {timeline.labels.map((minute) => (
                        <View
                          key={`${column.stage}-${minute}`}
                          style={[styles.rowLine, { top: minuteToY(minute, timeline.startMinute) }]}
                        />
                      ))}

                      {column.sets.map((setItem) => {
                        const top = minuteToY(timeToMinutes(setItem.start_time_pt), timeline.startMinute);
                        const startMin = timeToMinutes(setItem.start_time_pt);
                        const endMin = setItem.end_time_pt ? timeToMinutes(setItem.end_time_pt) : startMin;
                        const rawDuration = endMin - startMin;
                        const duration = rawDuration > 0 ? rawDuration : 120;
                        const height = Math.max(26, (duration / SLOT_MINUTES) * SLOT_HEIGHT - 2);
                        const definite = (setItem.attendees || []).filter((a) => a.preference === 'must_see');
                        const maybe = (setItem.attendees || []).filter((a) => a.preference !== 'must_see');
                        const maybeCount = Math.max(0, (setItem.attendee_count || 0) - definite.length);
                        const maxRows = height < 43 ? 1 : 2;
                        const maxBubbles = maxRows * BUBBLES_PER_ROW;
                        const hasOverflow = definite.length > maxBubbles;
                        const shownBubbles = hasOverflow
                          ? definite.slice(0, maxBubbles - 1)
                          : definite.slice(0, maxBubbles);
                        const overflowCount = hasOverflow ? definite.length - (maxBubbles - 1) : 0;
                        const actualRows = Math.ceil(shownBubbles.length / BUBBLES_PER_ROW) || 1;
                        const bubblesHeight = actualRows === 1 ? 16 : 35;
                        const showSummary = height >= bubblesHeight + 40;

                        return (
                          <View key={setItem.id} style={[styles.setCardWrap, { top, height }]}>
                            <Pressable
                              onPress={() => setExpandedSet({ ...setItem, definite, maybe })}
                              style={[styles.setTag, tierStyle(setItem.popularity_tier, C)]}
                            >
                              <Text style={styles.artistText} numberOfLines={1}>{setItem.artist_name}</Text>
                              <Text style={styles.timeRangeText} numberOfLines={1}>
                                {setItem.start_time_pt}{setItem.end_time_pt && setItem.end_time_pt !== setItem.start_time_pt ? `–${setItem.end_time_pt}` : ''}
                              </Text>
                              <View style={styles.pin}>
                                <View style={styles.attendeeRow}>
                                  {shownBubbles.map((attendee) => (
                                    <View
                                      key={attendee.member_id}
                                      style={[
                                        styles.attendeeBubble,
                                        { backgroundColor: attendee.chip_color || memberColorById[attendee.member_id] || C.attendeeBg }
                                      ]}
                                    >
                                      <Text style={styles.attendeeText}>{initials(attendee.display_name)}</Text>
                                    </View>
                                  ))}
                                  {overflowCount > 0 ? (
                                    <View style={styles.overflowBubble}>
                                      <Text style={styles.overflowText}>+{overflowCount}</Text>
                                    </View>
                                  ) : null}
                                </View>
                                {showSummary ? (
                                  <Text style={styles.summaryText} numberOfLines={1}>
                                    {definite.length} definitely · {maybeCount} maybe
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      ) : null}

      <Modal visible={Boolean(expandedSet)} transparent animationType="fade" onRequestClose={() => setExpandedSet(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setExpandedSet(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {expandedSet ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{expandedSet.artist_name}</Text>
                <Text style={styles.modalSubtitle}>
                  {expandedSet.stage_name} • {expandedSet.start_time_pt}-{expandedSet.end_time_pt}
                </Text>

                <Text style={styles.modalSectionTitle}>Definitely ({expandedSet.definite.length})</Text>
                {(expandedSet.definite || []).length ? (
                  <View style={styles.modalList}>
                    {expandedSet.definite.map((attendee) => (
                      <AttendeeRow
                        key={`def-${attendee.member_id}`}
                        attendee={attendee}
                        chipColor={attendee.chip_color || memberColorById[attendee.member_id]}
                        isSelf={attendee.member_id === myMemberId}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.modalEmpty}>No one marked definitely yet.</Text>
                )}

                <Text style={styles.modalSectionTitle}>Maybe ({expandedSet.maybe.length})</Text>
                {(expandedSet.maybe || []).length ? (
                  <View style={styles.modalList}>
                    {expandedSet.maybe.map((attendee) => (
                      <AttendeeRow
                        key={`maybe-${attendee.member_id}`}
                        attendee={attendee}
                        chipColor={attendee.chip_color || memberColorById[attendee.member_id]}
                        isSelf={attendee.member_id === myMemberId}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.modalEmpty}>No maybes for this set.</Text>
                )}

                {myMemberId && onAddToMySchedule ? (() => {
                  const myAttendance = (expandedSet.attendees || []).find(
                    (a) => a.member_id === myMemberId
                  );
                  return (
                    <>
                      <View style={styles.modalDivider} />
                      {myAttendance ? (
                        <View style={styles.modalStatusPill}>
                          <Text style={styles.modalStatusText}>
                            ✓ On your schedule — {myAttendance.preference === 'must_see' ? 'Must See' : 'Maybe'}
                          </Text>
                          <Text style={styles.modalAddHint}>Edit in your schedule to change preference</Text>
                        </View>
                      ) : (
                        <AddToScheduleFooter
                          setItem={expandedSet}
                          onAdd={onAddToMySchedule}
                          onAdded={() => setExpandedSet(null)}
                        />
                      )}
                    </>
                  );
                })() : null}
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function AttendeeRow({ attendee, chipColor, isSelf = false }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.modalRow}>
      <View
        style={[
          styles.modalAvatar,
          { backgroundColor: withAlpha(chipColor || C.attendeeBg, 0.2), borderColor: chipColor || C.attendeeBg }
        ]}
      >
        <Text style={[styles.modalAvatarText, { color: chipColor || C.attendeeBg }]}>
          {initials(attendee.display_name)}
        </Text>
      </View>
      <Text style={styles.modalName}>
        {attendee.display_name}
        {isSelf ? <Text style={styles.modalSelfLabel}> (you)</Text> : null}
      </Text>
    </View>
  );
}

function AddToScheduleFooter({ setItem, onAdd, onAdded }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    setAdding(true);
    setAddError('');
    try {
      await onAdd(setItem);
      setAdded(true);
      setTimeout(onAdded, 1000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add. Try again.');
    } finally {
      setAdding(false);
    }
  };

  if (added) {
    return (
      <View style={styles.modalAddedPill}>
        <Text style={styles.modalAddedText}>✓ Added as maybe!</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={handleAdd} disabled={adding} style={[styles.modalAddBtn, adding && { opacity: 0.6 }]}>
        <LinearGradient
          colors={C.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modalAddBtnGradient}
        >
          <Text style={styles.modalAddBtnText}>{adding ? 'Adding…' : '+ Add to My Schedule'}</Text>
        </LinearGradient>
      </Pressable>
      <Text style={styles.modalAddHint}>Adds as "maybe" — edit in your schedule to confirm</Text>
      {addError ? <Text style={styles.modalAddError}>{addError}</Text> : null}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 12, paddingTop: 16 },
  filterSection: { paddingBottom: 8 },
  filterBar: { gap: 6 },
  gridOuter: {
    flex: 1,
    flexDirection: 'row',
  },
  timePanel: {
    width: 70,
    borderRightWidth: 1,
    borderColor: C.gridBorder,
  },
  timePanelHeader: {
    height: GRID_HEADER_HEIGHT,
    paddingHorizontal: 6,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderColor: C.gridBorder,
    backgroundColor: C.gridTimeBg,
  },
  stagesHScroll: {
    flex: 1,
  },
  gridVScroll: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  peopleRow: { gap: 6, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: 'flex-start'
  },
  chipSelected: {
    borderBottomWidth: 2,
    borderBottomColor: C.chipSelectedBorder
  },
  chipText: { fontSize: 13, fontWeight: '800' },
  resetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resetBtnText: {
    color: C.resetBtnText,
    fontWeight: '800',
    fontSize: 12,
    textDecorationLine: 'underline',
    textDecorationColor: C.resetBtnUnderline
  },
  helperPad: { color: C.textMuted, fontSize: 12, paddingHorizontal: 2, paddingTop: 2 },
  gridHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: C.gridBorder,
    height: GRID_HEADER_HEIGHT,
    alignItems: 'center',
  },
  headerCell: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderColor: C.gridBorder
  },
  gridBody: { flexDirection: 'row' },
  timeCol: { width: 70, backgroundColor: C.gridTimeBg },
  stageCol: { width: 130, borderRightWidth: 1, borderColor: C.gridBorder, position: 'relative', backgroundColor: C.gridStageBg },
  headerText: { fontWeight: '700', color: C.gridHeaderText, fontSize: 12 },
  timeTick: { position: 'absolute', left: 4 },
  timeText: { color: C.gridTimeText, fontWeight: '700', fontSize: 11 },
  rowLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: C.gridRowLine },
  setCardWrap: {
    position: 'absolute',
    left: 3,
    right: 3,
    zIndex: 2
  },
  setTag: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 3,
    paddingVertical: 2,
    backgroundColor: C.setCardBg,
    overflow: 'hidden',
    position: 'relative',
  },
  artistText: { fontWeight: '800', color: C.setCardText, fontSize: 10, lineHeight: 11 },
  timeRangeText: { color: C.setCardTimeTxt, fontSize: 8, marginTop: 1, lineHeight: 9 },
  pin: {
    position: 'absolute',
    bottom: 2,
    left: 3,
    right: 3,
    flexDirection: 'column',
    gap: 2,
  },
  attendeeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  attendeeBubble: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: C.attendeeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeText: { color: C.attendeeText, fontSize: 7, fontWeight: '800' },
  overflowBubble: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: C.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: { color: '#fff', fontSize: 6.5, fontWeight: '800' },
  summaryText: { color: C.setCardSummaryTxt, fontSize: 8, lineHeight: 9 },
  modalOverlay: {
    flex: 1,
    backgroundColor: C.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.modalBorder,
    backgroundColor: C.modalBg,
    padding: 14
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.modalTitle },
  modalSubtitle: { marginTop: 2, marginBottom: 10, color: C.modalSubtitle, fontSize: 12 },
  modalSectionTitle: { marginTop: 4, marginBottom: 6, color: C.modalSectionTitle, fontWeight: '700', fontSize: 13 },
  modalList: { gap: 6, marginBottom: 6 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalAvatar: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalAvatarText: { fontSize: 10, fontWeight: '800' },
  modalName: { color: C.modalName, fontSize: 13, fontWeight: '600' },
  modalEmpty: { color: C.modalEmpty, fontSize: 12, marginBottom: 6 },
  modalSelfLabel: { color: C.textMuted, fontWeight: '400', fontSize: 13 },
  modalDivider: { height: 1, backgroundColor: C.cardBorder, marginVertical: 4 },
  modalStatusPill: {
    backgroundColor: C.primaryBg,
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: C.inputBorder,
    alignItems: 'center',
    gap: 3,
  },
  modalStatusText: { fontSize: 13, fontWeight: '700', color: C.kickerText, textAlign: 'center' },
  modalAddHint: { fontSize: 11, color: C.textMuted, textAlign: 'center' },
  modalAddedPill: {
    backgroundColor: C.successBg,
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: C.successBorder,
    alignItems: 'center',
  },
  modalAddedText: { fontSize: 13, fontWeight: '800', color: C.success },
  modalAddError: { fontSize: 11, color: C.error, textAlign: 'center' },
  modalAddBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: C.primaryShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  modalAddBtnGradient: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  inviteText: { fontSize: 12, color: C.inviteRowText },
  inviteCode: { fontWeight: '800', color: C.inviteRowCode, letterSpacing: 1 },
  inviteCopyIcon: { fontSize: 14 },
});

function tierStyle(tier, C) {
  if (tier === 'high') {
    return { borderColor: C.tierHighBorder, backgroundColor: C.tierHighBg };
  }
  if (tier === 'medium') {
    return { borderColor: C.tierMidBorder, backgroundColor: C.tierMidBg };
  }
  if (tier === 'low') {
    return { borderColor: C.tierLowBorder, backgroundColor: C.tierLowBg };
  }
  return { borderColor: C.setCardBorder, backgroundColor: C.setCardBg };
}

