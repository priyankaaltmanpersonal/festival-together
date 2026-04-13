import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DayTabReview } from '../components/DayTabReview';
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
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const scrollViewRef = useRef(null);

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
  errorText: { color: C.error, fontWeight: '600', fontSize: 13 },
});
