import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DayTabReview } from '../components/DayTabReview';
import { useTheme } from '../theme';

export function EditMyScheduleScreen({
  personalSets,
  festivalDays,
  loading,
  onImportPersonal,
  onRefreshPersonal,
  onSetAllMustSee,
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
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.label}>Update Your Schedule</Text>
        <Text style={styles.helper}>Upload more screenshots if your plans changed.</Text>
        <Pressable onPress={onImportPersonal} style={[styles.buttonPrimary, loading && styles.buttonDisabled]} disabled={loading}>
          <Text style={styles.buttonText}>Upload + Re-Parse</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable onPress={onRefreshPersonal} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
          <Pressable onPress={onSetAllMustSee} style={styles.buttonSecondary}>
            <Text style={styles.buttonText}>All Must-See</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 4 }} /> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          Your Schedule ({(personalSets || []).length} artists)
        </Text>
        {(festivalDays || []).length === 0 ? (
          <Text style={styles.helper}>No schedule loaded yet.</Text>
        ) : (
          {/* dayIndex from DayTabReview callbacks is intentionally ignored:
              deletePersonalSet and setPreference use canonicalSetId only;
              addPersonalSet receives day_index inside the fields object */}
          <DayTabReview
            festivalDays={festivalDays || []}
            dayStates={dayStates}
            onRetry={() => {}}
            onDeleteSet={onDeleteSet}
            onAddSet={onAddSet}
            onSetPreference={onSetPreference}
            onEditSet={onEditSet}
          />
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
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
  row: { flexDirection: 'row', gap: 8 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: C.btnSecondaryBg,
    borderWidth: 1,
    borderColor: C.btnSecondaryBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: C.primaryText, fontWeight: '700', fontSize: 13 },
});
