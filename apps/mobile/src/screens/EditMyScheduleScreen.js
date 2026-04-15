import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AddArtistFormCard, DayTabReview } from '../components/DayTabReview';
import { useTheme } from '../theme';

export function EditMyScheduleScreen({
  personalSets,
  festivalDays,
  onReUploadDay,
  uploadingDayIndex,
  onSetPreference,
  onDeleteSet,
  onAddSet,
  onEditSet,
  initialDayIndex,
  uploadError,
  onDismissError,
  officialSets,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const scrollViewRef = useRef(null);
  const [isAddingTopLevel, setIsAddingTopLevel] = useState(false);

  // Build dayStates from personalSets so DayTabReview can render them.
  // If a day is currently being uploaded, override its status to 'uploading'.
  const dayStates = useMemo(() => {
    const result = {};
    for (const day of (festivalDays || [])) {
      const isUploading = uploadingDayIndex === day.dayIndex;
      const daySets = (personalSets || []).filter((s) => s.day_index === day.dayIndex);
      result[day.dayIndex] = {
        status: isUploading ? 'uploading' : daySets.length > 0 ? 'done' : 'idle',
        sets: daySets,
        retryCount: 0,
        imageUris: null,
      };
    }
    return result;
  }, [festivalDays, personalSets, uploadingDayIndex]);

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {uploadError ? (
        <Pressable onPress={onDismissError} style={styles.errorBanner}>
          <Text style={styles.errorText}>{uploadError}</Text>
        </Pressable>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>
          Your Schedule ({(personalSets || []).length} artists)
        </Text>
        {(festivalDays || []).length > 0 ? (
          isAddingTopLevel ? (
            <AddArtistFormCard
              festivalDays={festivalDays}
              onAdd={async (fields) => { await onAddSet(fields); setIsAddingTopLevel(false); }}
              onCancel={() => setIsAddingTopLevel(false)}
              officialSets={officialSets}
            />
          ) : (
            <Pressable
              onPress={() => {
                setIsAddingTopLevel(true);
                setTimeout(() => scrollViewRef.current?.scrollTo({ y: 0, animated: true }), 50);
              }}
              style={styles.addBtn}
            >
              <Text style={styles.addBtnText}>+ Add Artist</Text>
            </Pressable>
          )
        ) : null}
        {(festivalDays || []).length === 0 ? (
          <Text style={styles.helper}>No schedule loaded yet.</Text>
        ) : (
          // dayIndex from DayTabReview callbacks is intentionally ignored:
          // deletePersonalSet and setPreference use canonicalSetId only;
          // addPersonalSet receives day_index inside the fields object
          <DayTabReview
            festivalDays={festivalDays || []}
            dayStates={dayStates}
            initialSelectedDay={initialDayIndex}
            storageKey="edit_schedule_selected_day"
            onRetry={() => {}}
            onDeleteSet={onDeleteSet}
            onAddSet={onAddSet}
            onSetPreference={onSetPreference}
            onEditSet={onEditSet}
            onReUpload={onReUploadDay}
            onAddOpen={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50)}
            officialSets={officialSets}
            hideAddButton
          />
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 20 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8,
  },
  label: { fontWeight: '700', color: C.text },
  helper: { color: C.textMuted, fontSize: 12 },
  addBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.primary,
    backgroundColor: C.cardBg,
  },
  addBtnText: { color: C.primary, fontWeight: '700' },
  errorBanner: {
    marginHorizontal: 4,
    marginBottom: 8,
    backgroundColor: C.errorBg,
    borderWidth: 1,
    borderColor: C.errorBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: { color: C.error, fontWeight: '700', fontSize: 13 },
});
