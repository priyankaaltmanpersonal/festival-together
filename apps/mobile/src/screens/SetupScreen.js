import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { dateFromDateKey, formatDateKey } from '../utils';


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
  onSetFestivalDateRange,
  loading,
  error,
  onBeginProfile,
  onCompleteFestivalSetup,
  onResetFlow,
  onChoosePath,
  // upload_official_schedule step
  onboardingLineupState = 'idle',
  onboardingLineupResult = null,
  onImportOfficialSchedule,
  onImportFromPreset,
  availablePresets = [],
  pendingPresetId = null,
  onChoosePresetForSetup,
  onClearPresetForSetup,
  onSkipOfficialSchedule,
  onFinishSetup,
  onGoBack,
  onStartOver,
}) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const scrollViewRef = useRef(null);
  const isWelcome = onboardingStep === 'welcome';
  const manualDateRangeReady = (festivalDays || []).some((day) => day.date);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.scrollView}
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
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} maxLength={60} />
          <Text style={styles.inputLabel}>Group name</Text>
          <TextInput value={groupName} onChangeText={setGroupName} style={styles.input} maxLength={100} />
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
          <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} maxLength={60} />
          <Text style={styles.inputLabel}>Invite code</Text>
          <TextInput
            value={inviteCodeInput}
            onChangeText={(t) => setInviteCodeInput(t.trim())}
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
          <Text style={styles.stepTitle}>Your Festival</Text>

          {pendingPresetId ? (
            // Preset selected — show confirmation and read-only days
            <>
              <View style={styles.presetSelectedBox}>
                <Text style={styles.presetSelectedText}>
                  ✓ {availablePresets.find((p) => p.id === pendingPresetId)?.label}
                </Text>
                <ActionButton label="Change" onPress={onClearPresetForSetup} disabled={loading} />
              </View>
              <Text style={styles.helper}>
                Days: {(festivalDays || []).map((d) => d.label).join(' · ')}
              </Text>
              <ActionButton label="Continue →" onPress={onCompleteFestivalSetup} primary disabled={loading} />
            </>
          ) : availablePresets.length > 0 ? (
            // Show preset options first, then manual entry below
            <>
              <Text style={styles.helper}>Select your festival:</Text>
              {availablePresets.map((preset) => (
                <ActionButton
                  key={preset.id}
                  label={preset.label}
                  onPress={() => onChoosePresetForSetup(preset.id)}
                  primary
                  disabled={loading}
                />
              ))}
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or choose dates manually</Text>
                <View style={styles.orLine} />
              </View>
              <FestivalDateRangePicker
                festivalDays={festivalDays}
                onSetFestivalDateRange={onSetFestivalDateRange}
                disabled={loading}
              />
              <ActionButton label="Continue" onPress={onCompleteFestivalSetup} primary disabled={loading || !manualDateRangeReady} />
            </>
          ) : (
            // No presets — plain day entry
            <>
              <Text style={styles.helper}>Choose the first and last date you're attending. We'll create each festival day and label it automatically.</Text>
              <FestivalDateRangePicker
                festivalDays={festivalDays}
                onSetFestivalDateRange={onSetFestivalDateRange}
                disabled={loading}
              />
              <ActionButton label="Continue" onPress={onCompleteFestivalSetup} primary disabled={loading || !manualDateRangeReady} />
            </>
          )}
        </View>
      ) : null}


      {onboardingStep === 'upload_official_schedule' ? (() => {
        const daysProcessed = onboardingLineupResult?.days_processed || [];
        const missingDays = (festivalDays || [])
          .map((d) => d.label)
          .filter((label) => !daysProcessed.includes(label));

        return (
          <View style={styles.stepCard}>
            {onboardingLineupState !== 'uploading' ? (
              <ActionButton label="← Back" onPress={onGoBack} disabled={loading} />
            ) : null}
            <Text style={styles.stepTitle}>Import Official Schedule</Text>
            {onboardingLineupState === 'uploading' ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ActivityIndicator color={C.primary} size="small" />
                  <Text style={[styles.helper, { flex: 1 }]}>Importing lineup… this may take 1–2 minutes. Please keep the app open.</Text>
                </View>
              </View>
            ) : onboardingLineupState === 'done' && onboardingLineupResult ? (
              <>
                <View style={styles.successBox}>
                  <Text style={styles.successText}>
                    ✓ {onboardingLineupResult.sets_created} sets imported
                    {daysProcessed.length ? ` across ${daysProcessed.join(', ')}` : ''}
                  </Text>
                </View>
                {missingDays.length > 0 ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      Couldn't read: {missingDays.join(', ')}. Re-upload those days from Founder Tools after setup.
                    </Text>
                  </View>
                ) : null}
                <ActionButton label="Go to Group Schedule →" onPress={onFinishSetup} primary disabled={loading} />
              </>
            ) : onboardingLineupState === 'error' ? (
              <>
                <Text style={styles.helper}>You can retry this after setup from Founder Tools → Official Lineup.</Text>
                <ActionButton label="Try Again" onPress={onImportOfficialSchedule} primary disabled={loading} />
                <ActionButton label="Skip for Now" onPress={onSkipOfficialSchedule} disabled={loading} />
              </>
            ) : (
              <>
                <Text style={styles.helper}>
                  Import the official schedule so everyone in your group can browse and pick artists — no screenshots needed.
                </Text>
                {availablePresets.length > 0 ? (
                  <>
                    {availablePresets.map((preset) => (
                      <ActionButton
                        key={preset.id}
                        label={preset.label}
                        onPress={() => onImportFromPreset(preset.id)}
                        primary
                        disabled={loading}
                      />
                    ))}
                    <ActionButton
                      label="Upload a different festival's schedule"
                      onPress={onImportOfficialSchedule}
                      disabled={loading}
                    />
                  </>
                ) : (
                  <ActionButton
                    label="Upload Schedule Images"
                    onPress={onImportOfficialSchedule}
                    primary
                    disabled={loading}
                  />
                )}
                <ActionButton
                  label="Skip for Now — upload from Founder Tools after setup"
                  onPress={onSkipOfficialSchedule}
                  disabled={loading}
                />
              </>
            )}
            <StartOverLink onPress={onStartOver} styles={styles} />
          </View>
        );
      })() : null}


      {loading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      {error && onboardingStep !== 'upload_all_days' && onboardingStep !== 'upload_official_schedule' ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}


function StartOverLink({ onPress, styles }) {
  return (
    <Pressable onPress={onPress} style={styles.startOverLink}>
      <Text style={styles.startOverText}>Start over</Text>
    </Pressable>
  );
}

function FestivalDateRangePicker({ festivalDays, onSetFestivalDateRange, disabled = false }) {
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const fallbackDate = formatDateKey(new Date());
  const firstDate = (festivalDays || []).find((day) => day.date)?.date || '';
  const lastDate = [...(festivalDays || [])].reverse().find((day) => day.date)?.date || '';
  const [activePicker, setActivePicker] = useState(null);

  const updateRange = (which, selectedDate) => {
    const nextKey = formatDateKey(selectedDate);
    if (which === 'start') {
      const nextEnd = lastDate && lastDate >= nextKey ? lastDate : nextKey;
      onSetFestivalDateRange(nextKey, nextEnd);
    } else {
      const nextStart = firstDate && firstDate <= nextKey ? firstDate : nextKey;
      onSetFestivalDateRange(nextStart, nextKey);
    }
  };

  return (
    <View style={styles.dateRangeCard}>
      <View style={styles.dateButtonRow}>
        <View style={styles.dateField}>
          <Text style={styles.inputLabel}>Start date</Text>
          <Pressable
            disabled={disabled}
            onPress={() => setActivePicker(activePicker === 'start' ? null : 'start')}
            style={[styles.dateButton, activePicker === 'start' && styles.dateButtonActive, disabled && styles.buttonDisabled]}
          >
            <Text style={[styles.dateButtonText, !firstDate && styles.dateButtonPlaceholder]}>
              {firstDate || 'Select'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.dateField}>
          <Text style={styles.inputLabel}>End date</Text>
          <Pressable
            disabled={disabled}
            onPress={() => setActivePicker(activePicker === 'end' ? null : 'end')}
            style={[styles.dateButton, activePicker === 'end' && styles.dateButtonActive, disabled && styles.buttonDisabled]}
          >
            <Text style={[styles.dateButtonText, !lastDate && styles.dateButtonPlaceholder]}>
              {lastDate || 'Select'}
            </Text>
          </Pressable>
        </View>
      </View>

      {activePicker ? (
        <View style={styles.pickerContainer}>
          <DateTimePicker
            value={dateFromDateKey((activePicker === 'start' ? firstDate : lastDate) || firstDate || fallbackDate)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(event, selectedDate) => {
              if (Platform.OS === 'android') setActivePicker(null);
              if (selectedDate) updateRange(activePicker, selectedDate);
            }}
            style={styles.datePicker}
            textColor={C.text}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setActivePicker(null)} style={styles.pickerDoneBtn}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {(festivalDays || []).some((day) => day.date) ? (
        <Text style={styles.helper}>
          Days: {(festivalDays || []).map((day) => `${day.label} ${day.date}`).join(' · ')}
        </Text>
      ) : null}
    </View>
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
  scrollView: { flex: 1 },
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
  h1: { color: C.headingText, fontSize: 21, fontWeight: '700', lineHeight: 26 },
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
  dateRangeCard: { gap: 8 },
  dateButtonRow: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 1, gap: 4 },
  dateButton: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: C.inputBg,
  },
  dateButtonActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  dateButtonText: { color: C.text, fontWeight: '700', fontSize: 13 },
  dateButtonPlaceholder: { color: C.textMuted },
  pickerContainer: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    backgroundColor: C.inputBg,
    overflow: 'hidden',
  },
  datePicker: { alignSelf: 'stretch' },
  pickerDoneBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.inputBorder,
  },
  pickerDoneText: { color: C.primary, fontWeight: '700' },
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
  buttonTextLarge: { fontSize: 20, fontWeight: '700' },
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
  error: { color: C.error, fontWeight: '700' },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  successText: { color: '#16a34a', fontWeight: '700', fontSize: 13 },
  warningBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  warningText: { color: '#92400e', fontWeight: '700', fontSize: 13 },
  presetSelectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.successBg || '#f0fdf4',
    borderWidth: 1,
    borderColor: C.successBorder || '#86efac',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  presetSelectedText: { color: C.success || '#16a34a', fontWeight: '700', fontSize: 13, flex: 1 },
  startOverLink: { alignItems: 'center', paddingTop: 4 },
  startOverText: { color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: C.cardBorder },
  orText: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
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
