import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DayTabReview } from '../components/DayTabReview';
import { useTheme } from '../theme';


export function SetupScreen({
  userRole,
  onboardingStep,
  displayName,
  setDisplayName,
  groupName,
  setGroupName,
  inviteCodeInput,
  setInviteCodeInput,
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
  onChooseNewImage,
  onDeleteDaySet,
  onAddDaySet,
  onSetDayPreference,
  onEditDaySet,
  onConfirmDay,
  hasOfficialLineup,
  onBrowseFullLineup,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const scrollViewRef = useRef(null);
  const isWelcome = onboardingStep === 'welcome';

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={[styles.wrap, isWelcome && styles.wrapWelcome]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
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
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ActivityIndicator color={C.primary} size="small" />
                  <Text style={styles.helper}>Parsing your schedule…</Text>
                </View>
                <Text style={styles.helper}>This usually takes 5–10 seconds. Hang tight!</Text>
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
            {hasOfficialLineup ? (
              <>
                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or</Text>
                  <View style={styles.orLine} />
                </View>
                <ActionButton
                  label="Browse Full Lineup →"
                  onPress={onBrowseFullLineup}
                  disabled={loading}
                />
                <Text style={styles.helper}>
                  Skip photos — add artists directly from the full schedule
                </Text>
              </>
            ) : null}
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
            onReUpload={onChooseNewImage}
            onDeleteSet={onDeleteDaySet}
            onAddSet={onAddDaySet}
            onSetPreference={onSetDayPreference}
            onEditSet={onEditDaySet}
            onAddOpen={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50)}
            onConfirmDay={onConfirmDay}
          />
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      {error && onboardingStep !== 'upload_all_days' ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}


function ActionButton({ label, onPress, primary = false, disabled = false, large = false }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  if (primary) {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={[styles.buttonPrimaryWrap, large && styles.buttonLarge, disabled && styles.buttonDisabled]}
      >
        <LinearGradient
          colors={C.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.buttonPrimaryGradient, large && styles.buttonLarge]}
        >
          <Text style={[styles.buttonText, large && styles.buttonTextLarge]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.buttonSecondary, large && styles.buttonLarge, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, styles.buttonTextSecondary, large && styles.buttonTextLarge]}>{label}</Text>
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
  wrap: { flexGrow: 1, gap: 10, paddingHorizontal: 16, paddingBottom: 24, paddingTop: 16 },
  wrapWelcome: { paddingTop: 20, flex: 1 },
  welcomeScreen: { flex: 1, justifyContent: 'space-between' },
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
  buttonPrimaryWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: C.primaryShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPrimaryGradient: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: C.btnSecondaryBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  buttonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  buttonTextSecondary: { color: C.btnSecondaryText },
  buttonLarge: {
    minHeight: 66,
    justifyContent: 'center',
    borderRadius: 14
  },
  buttonTextLarge: { fontSize: 20, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
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
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: C.cardBorder },
  orText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
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
