import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DayTabReview } from '../components/DayTabReview';
import { useTheme } from '../theme';

function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  // Extended hours (24-29) = next-day early morning
  if (h >= 24) h -= 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${ampm}`;
}

export function SetupScreen({
  userRole,
  onboardingStep,
  displayName,
  setDisplayName,
  groupName,
  setGroupName,
  inviteCodeInput,
  setInviteCodeInput,
  inviteCode,
  selectedChipColor,
  setSelectedChipColor,
  chipColorOptions,
  availableJoinColors,
  festivalDays,
  setFestivalDayLabel,
  onAddFestivalDay,
  onRemoveFestivalDay,
  loading,
  error,
  log,
  onBeginProfile,
  onCompleteFestivalSetup,
  onResetFlow,
  onChoosePath,
  // upload_all_days step
  uploadDayIndex,
  dayStates,
  onChooseDayScreenshot,
  onSkipDay,
  // review_days step
  onRetryDay,
  onDeleteDaySet,
  onAddDaySet,
  onSetDayPreference,
  onEditDaySet,
  onFinishUploadFlow,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const isWelcome = onboardingStep === 'welcome';

  return (
    <ScrollView contentContainerStyle={[styles.wrap, isWelcome && styles.wrapWelcome]}>
      {isWelcome ? (
        <View style={styles.welcomeScreen}>
          <View style={styles.card}>
            <Text style={styles.kicker}>Welcome</Text>
            <Text style={styles.h1}>Plan your festival day with your crew</Text>
          </View>
          <View style={styles.welcomeActions}>
            <ActionButton
              label="Create a Group"
              onPress={() => onChoosePath('founder')}
              primary
              disabled={loading}
              large
            />
            <ActionButton label="Join a Group" onPress={() => onChoosePath('member')} disabled={loading} large />
          </View>
        </View>
      ) : null}

      {onboardingStep === 'profile_create' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={() => onChoosePath('welcome')} disabled={loading} />
          <Text style={styles.stepTitle}>Create Group</Text>
          <Text style={styles.inputLabel}>Your name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Your name" maxLength={60} />
          <Text style={styles.inputLabel}>Group name</Text>
          <TextInput value={groupName} onChangeText={setGroupName} style={styles.input} placeholder="Group name" maxLength={100} />
          <ColorPicker
            options={chipColorOptions}
            selected={selectedChipColor}
            onSelect={setSelectedChipColor}
          />
          <ActionButton label="Continue" onPress={onBeginProfile} primary disabled={loading || !selectedChipColor} />
        </View>
      ) : null}

      {onboardingStep === 'profile_join' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={() => onChoosePath('welcome')} disabled={loading} />
          <Text style={styles.stepTitle}>Join Group</Text>
          <Text style={styles.inputLabel}>Your name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder="Your name" maxLength={60} />
          <Text style={styles.inputLabel}>Invite code</Text>
          <TextInput
            value={inviteCodeInput}
            onChangeText={setInviteCodeInput}
            style={styles.input}
            autoCapitalize="characters"
            placeholder="Invite code"
          />
          <ColorPicker
            options={chipColorOptions}
            selected={selectedChipColor}
            onSelect={setSelectedChipColor}
            availableSet={new Set(availableJoinColors || [])}
          />
          <ActionButton label="Continue" onPress={onBeginProfile} primary disabled={loading || !selectedChipColor} />
        </View>
      ) : null}

      {onboardingStep === 'festival_setup' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={() => onChoosePath('founder')} disabled={loading} />
          <Text style={styles.stepTitle}>Festival Days</Text>
          <Text style={styles.helper}>Add each day of the festival you're attending.</Text>
          {(festivalDays || []).map((day, index) => (
            <View key={day.dayIndex} style={styles.dayRow}>
              <Text style={styles.dayIndexLabel}>Day {index + 1}</Text>
              <TextInput
                value={day.label}
                onChangeText={(text) => setFestivalDayLabel(day.dayIndex, text)}
                style={[styles.input, styles.dayInput]}
                placeholder={index === 0 ? 'e.g. Friday' : index === 1 ? 'e.g. Saturday' : 'e.g. Sunday'}
                maxLength={20}
              />
              <Pressable
                onPress={() => onRemoveFestivalDay(day.dayIndex)}
                disabled={(festivalDays || []).length <= 1}
                style={[styles.removeButton, (festivalDays || []).length <= 1 && styles.removeButtonDisabled]}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          ))}
          <ActionButton label="＋ Add Day" onPress={onAddFestivalDay} disabled={loading} />
          <ActionButton label="Continue" onPress={onCompleteFestivalSetup} primary disabled={loading} />
        </View>
      ) : null}

      {onboardingStep === 'upload_all_days' ? (() => {
        const totalDays = (festivalDays || []).length;
        const dayPosition = (festivalDays || []).findIndex((d) => d.dayIndex === uploadDayIndex) + 1;
        const currentDay = (festivalDays || []).find((d) => d.dayIndex === uploadDayIndex);
        const dayLabel = currentDay?.label || `Day ${uploadDayIndex}`;
        const truncatedLabel = dayLabel.length > 15 ? dayLabel.slice(0, 15) + '…' : dayLabel;
        const dayState = (dayStates || {})[uploadDayIndex] || { status: 'idle' };

        return (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Upload {truncatedLabel} schedule</Text>
            <Text style={styles.helper}>Day {dayPosition} of {totalDays}</Text>
            {dayState.status === 'uploading' ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <ActivityIndicator color={C.primary} size="small" />
                <Text style={styles.helper}>Uploading in background…</Text>
              </View>
            ) : dayState.status === 'done' ? (
              <Text style={styles.helper}>✓ {(dayState.sets || []).length} artists found</Text>
            ) : dayState.status === 'failed' ? (
              <Text style={[styles.helper, { color: C.error }]}>Upload failed — retry in review</Text>
            ) : null}
            <ActionButton
              label="Choose Screenshot"
              onPress={() => onChooseDayScreenshot(uploadDayIndex)}
              primary
              disabled={loading}
            />
            <ActionButton
              label="Skip This Day"
              onPress={onSkipDay}
              disabled={loading}
            />
          </View>
        );
      })() : null}

      {onboardingStep === 'review_days' ? (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Review Your Schedule</Text>
          <Text style={styles.helper}>Check each day and fix any mistakes.</Text>
          <DayTabReview
            festivalDays={festivalDays || []}
            dayStates={dayStates || {}}
            onRetry={onRetryDay}
            onDeleteSet={onDeleteDaySet}
            onAddSet={onAddDaySet}
            onSetPreference={onSetDayPreference}
            onEditSet={onEditDaySet}
          />
          <ActionButton
            label="Finish →"
            onPress={onFinishUploadFlow}
            primary
            disabled={loading || Object.values(dayStates || {}).some((d) => d.status === 'uploading')}
          />
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      {error && onboardingStep !== 'upload_all_days' ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function AddArtistCard({ onAdd, onCancel, defaultDayIndex }) {
  const C = useTheme();
  const addCardStyles = useMemo(() => makeAddCardStyles(C), [C]);
  const [name, setName] = useState('');
  const [stage, setStage] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!name.trim() || !stage.trim() || !start.trim() || !end.trim()) {
      setError('All fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({
        artist_name: name.trim(),
        stage_name: stage.trim(),
        start_time_pt: start.trim(),
        end_time_pt: end.trim(),
        day_index: defaultDayIndex || 1,
      });
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={addCardStyles.addCard}>
      <Text style={addCardStyles.addCardLabel}>Add Artist</Text>
      <Text style={addCardStyles.fieldLabel}>Artist name</Text>
      <TextInput value={name} onChangeText={setName} style={addCardStyles.input} placeholder="e.g. Bad Bunny" />
      <Text style={addCardStyles.fieldLabel}>Stage</Text>
      <TextInput value={stage} onChangeText={setStage} style={addCardStyles.input} placeholder="e.g. Coachella Stage" />
      <View style={addCardStyles.timeRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={addCardStyles.fieldLabel}>Start (HH:MM)</Text>
          <TextInput value={start} onChangeText={setStart} style={addCardStyles.input} placeholder="21:00" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={addCardStyles.fieldLabel}>End (HH:MM)</Text>
          <TextInput value={end} onChangeText={setEnd} style={addCardStyles.input} placeholder="23:00" />
        </View>
      </View>
      <View style={addCardStyles.saveRow}>
        {saving ? <ActivityIndicator color={C.primary} /> : (
          <Pressable onPress={handleAdd} style={addCardStyles.saveBtn}>
            <Text style={addCardStyles.saveBtnText}>Add</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={addCardStyles.cancelBtn}>
          <Text style={addCardStyles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
      {error ? <Text style={addCardStyles.saveError}>{error}</Text> : null}
    </View>
  );
}

const makeAddCardStyles = (C) => StyleSheet.create({
  addCard: { borderWidth: 1, borderColor: C.addCardBorder, borderRadius: 10, padding: 10, backgroundColor: C.addCardBg, gap: 6 },
  addCardLabel: { fontWeight: '700', color: C.addCardLabel, fontSize: 13 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.fieldLabelText },
  input: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, fontSize: 13, backgroundColor: C.inputBg },
  timeRow: { flexDirection: 'row', gap: 8 },
  saveRow: { flexDirection: 'row', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.inputBorder, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center' },
  cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
  saveError: { color: C.error, fontWeight: '600', fontSize: 12 },
});

function ActionButton({ label, onPress, primary = false, disabled = false, large = false }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        large && styles.buttonLarge,
        disabled && styles.buttonDisabled
      ]}
    >
      <Text style={[styles.buttonText, large && styles.buttonTextLarge]}>{label}</Text>
    </Pressable>
  );
}

function PrefButton({ label, selected, onPress }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable onPress={onPress} style={[styles.prefButton, selected && styles.prefButtonSelected]}>
      <Text style={[styles.prefButtonText, selected && styles.prefButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ColorPicker({ options, selected, onSelect, availableSet = null }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const all = options || [];
  const rows = [all.slice(0, 9), all.slice(9, 18)];
  return (
    <View style={styles.colorBlock}>
      <Text style={styles.label}>Pick your color</Text>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.colorRow}>
          {row.map((color) => {
            const enabled = !availableSet || availableSet.size === 0 || availableSet.has(color);
            return (
              <Pressable
                key={color}
                disabled={!enabled}
                onPress={() => onSelect(color)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color, borderColor: selected === color ? C.swatchSelectedBorder : C.swatchDefaultBorder },
                  selected === color && styles.colorSwatchSelected,
                  !enabled && styles.colorSwatchDisabled
                ]}
              />
            );
          })}
        </View>
      ))}
      {availableSet && availableSet.size > 0 ? (
        <Text style={styles.helper}>Unavailable colors are dimmed if already taken in that group.</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  wrap: { flexGrow: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 24 },
  wrapWelcome: { paddingTop: 20 },
  welcomeScreen: { gap: 20 },
  welcomeActions: { gap: 12 },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 12,
    gap: 8
  },
  stepCard: {
    backgroundColor: C.stepCardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.stepCardBorder,
    padding: 12,
    gap: 8
  },
  kicker: { color: C.kickerText, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  h1: { color: C.headingText, fontSize: 21, fontWeight: '800', lineHeight: 26 },
  label: { color: C.text, fontWeight: '700' },
  stepTitle: { color: C.text, fontWeight: '700', fontSize: 16 },
  inputLabel: { color: C.fieldLabelText, fontSize: 12, fontWeight: '700', marginTop: 2 },
  helper: { color: C.textMuted, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: C.inputBg
  },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayIndexLabel: { color: C.fieldLabelText, fontSize: 12, fontWeight: '700', width: 40 },
  dayInput: { flex: 1 },
  buttonPrimary: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonSecondary: {
    backgroundColor: C.btnSecondaryText,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  buttonLarge: {
    minHeight: 66,
    justifyContent: 'center',
    borderRadius: 14
  },
  buttonTextLarge: { fontSize: 20, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  setRow: {
    borderWidth: 1,
    borderColor: C.setRowBorder,
    borderRadius: 10,
    padding: 8,
    backgroundColor: C.setRowBg,
    gap: 4
  },
  setTitle: { color: C.setRowTitle, fontWeight: '700', fontSize: 13 },
  prefRow: { flexDirection: 'row', gap: 6 },
  prefButton: {
    borderWidth: 1,
    borderColor: C.prefBtnBorder,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.prefBtnBg
  },
  prefButtonSelected: { borderColor: C.prefBtnActiveBorder, backgroundColor: C.prefBtnActiveBg },
  prefButtonText: { color: C.prefBtnText, fontSize: 12, fontWeight: '700' },
  prefButtonTextSelected: { color: C.prefBtnActiveText },
  colorBlock: { gap: 8, marginTop: 2 },
  colorRow: { flexDirection: 'row', justifyContent: 'space-between' },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2
  },
  colorSwatchSelected: {
    transform: [{ scale: 1.08 }]
  },
  colorSwatchDisabled: {
    opacity: 0.25
  },
  removeButton: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.stepCardBorder, alignItems: 'center', justifyContent: 'center'
  },
  removeButtonDisabled: { opacity: 0.3 },
  removeButtonText: { fontSize: 18, color: C.fieldLabelText, fontWeight: '700', lineHeight: 20 },
  error: { color: C.error, fontWeight: '600' },
  logLine: { color: C.textMuted, fontSize: 11 },
  skipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  parsedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipLink: { color: C.btnSecondaryText, fontWeight: '600', fontSize: 13 },
  uploadingBlock: { gap: 4 },
  uploadingRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  uploadingHint: { color: C.textMuted, fontSize: 11, fontStyle: 'italic' },
  parsedCount: { color: C.primary, fontWeight: '700', fontSize: 14 },
  addButton: {
    borderWidth: 1,
    borderColor: C.addCardBorder,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: C.addCardBg,
  },
  addButtonText: { color: C.addCardLabel, fontWeight: '700', fontSize: 13 },
});
