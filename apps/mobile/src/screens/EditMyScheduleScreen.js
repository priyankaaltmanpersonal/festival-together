import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DayTabReview } from '../components/DayTabReview';
import { useTheme } from '../theme';

export function EditMyScheduleScreen({
  personalSets,
  festivalDays,
  onReUploadDay,
  onSetPreference,
  onDeleteSet,
  onAddSet,
  onEditSet,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  // Build dayStates from personalSets so DayTabReview can render them
  const dayStates = useMemo(() => {
    const result = {};
    for (const day of (festivalDays || [])) {
      result[day.dayIndex] = {
        status: 'done',
        sets: (personalSets || []).filter((s) => s.day_index === day.dayIndex),
        retryCount: 0,
        imageUris: null,
      };
    }
    return result;
  }, [festivalDays, personalSets]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
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
            onRetry={() => {}}
            onDeleteSet={onDeleteSet}
            onAddSet={onAddSet}
            onSetPreference={onSetPreference}
            onEditSet={onEditSet}
            onReUpload={onReUploadDay}
          />
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
});
